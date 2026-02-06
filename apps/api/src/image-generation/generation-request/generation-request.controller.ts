import {
	Controller,
	Get,
	Post,
	Delete,
	Body,
	Param,
	UseGuards,
	HttpException,
	HttpStatus,
	Req,
	Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { Roles } from '../../user/auth/roles.decorator';
import { RolesGuard } from '../../user/auth/roles.guard';
import { HasOrganizationAccessGuard } from '../../organization/guards/has-organization-access.guard';
import { UserRole } from '../../user/user-role.enum';
import { User } from '../../user/user.entity';
import { ResponseEnvelope, ResponseStatus } from '../../_core/models';
import { AgentService } from '../agent/agent.service';
import { JobQueueService } from '../jobs/job-queue.service';
import {
	GenerationRequest,
	GenerationRequestStatus,
	GeneratedImage,
} from '../entities';

import { GenerationRequestService } from './generation-request.service';
import { RequestCreateDto } from './dtos';

const basePath = 'organization/:orgId/image-generation/requests';

@Controller(basePath)
export class GenerationRequestController {
	constructor(
		private readonly requestService: GenerationRequestService,
		private readonly agentService: AgentService,
		private readonly jobQueueService: JobQueueService,
	) {}

	@Get()
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getRequests(
		@Param('orgId') orgId: string,
		@Query('status') status?: GenerationRequestStatus,
		@Query('limit') limit?: string,
		@Query('offset') offset?: string,
	) {
		// Parse and validate pagination parameters
		const parsedLimit = limit ? parseInt(limit, 10) : 50;
		const parsedOffset = offset ? parseInt(offset, 10) : 0;
		const safeLimit = Number.isNaN(parsedLimit)
			? 50
			: Math.min(parsedLimit, 100);
		const safeOffset = Number.isNaN(parsedOffset)
			? 0
			: Math.max(parsedOffset, 0);

		const requests = await this.requestService.findByOrganization(
			orgId,
			status,
			safeLimit,
			safeOffset,
		);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			requests.map((r) => new GenerationRequest(r).toPublic()),
		);
	}

	@Get(':id')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getRequest(
		@Param('orgId') orgId: string,
		@Param('id') id: string,
	) {
		const request = await this.requestService.getWithImages(id, orgId);

		if (!request) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Request not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new GenerationRequest(request).toDetailed(),
		);
	}

	@Post()
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async createRequest(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Body() createDto: RequestCreateDto,
	) {
		if (req.user.organizationId !== orgId) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`You don't have access to this organization.`,
				),
				HttpStatus.FORBIDDEN,
			);
		}

		// Validate that all judge IDs exist and belong to the organization
		const agents = await this.agentService.findByIds(
			createDto.judgeIds,
			orgId,
		);

		if (agents.length !== createDto.judgeIds.length) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'One or more judge IDs are invalid.',
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		const request = await this.requestService
			.create({
				organizationId: orgId,
				brief: createDto.brief,
				referenceImageUrls: createDto.referenceImageUrls,
				negativePrompts: createDto.negativePrompts,
				judgeIds: createDto.judgeIds,
				imageParams: {
					imagesPerGeneration:
						createDto.imageParams?.imagesPerGeneration ?? 1,
					aspectRatio: createDto.imageParams?.aspectRatio,
					quality: createDto.imageParams?.quality,
				},
				threshold: createDto.threshold ?? 75,
				maxIterations: createDto.maxIterations ?? 10,
			})
			.catch(() => null);

		if (!request) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Error creating generation request.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		// Queue the request for processing via pg-boss
		try {
			await this.jobQueueService.queueGenerationRequest(
				request.id,
				orgId,
			);
		} catch (queueError) {
			// Request was created but queueing failed - clean up and report error
			await this.requestService.fail(
				request.id,
				'Failed to queue request for processing',
			);
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Request created but failed to queue for processing. Please try again.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Generation request created and queued for processing.',
			new GenerationRequest(request).toPublic(),
		);
	}

	@Delete(':id')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async cancelRequest(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Param('id') id: string,
	) {
		if (req.user.organizationId !== orgId) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`You don't have access to this organization.`,
				),
				HttpStatus.FORBIDDEN,
			);
		}

		const request = await this.requestService.findOne({
			where: { id, organizationId: orgId },
		});

		if (!request) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Request not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		// Can only cancel pending or in-progress requests
		const cancellableStatuses = [
			GenerationRequestStatus.PENDING,
			GenerationRequestStatus.OPTIMIZING,
			GenerationRequestStatus.GENERATING,
			GenerationRequestStatus.EVALUATING,
		];

		if (!cancellableStatuses.includes(request.status)) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`Cannot cancel request with status: ${request.status}`,
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		await this.requestService.cancel(id);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Request cancelled successfully.',
		);
	}

	@Post(':id/trigger')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async triggerRequest(
		@Param('orgId') orgId: string,
		@Param('id') id: string,
	) {
		const request = await this.requestService.findOne({
			where: { id, organizationId: orgId },
		});

		if (!request) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Request not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		// Only allow triggering pending requests
		if (request.status !== GenerationRequestStatus.PENDING) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`Cannot trigger request with status: ${request.status}`,
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		// Queue for processing
		await this.jobQueueService.queueGenerationRequest(id, orgId);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Request triggered for processing.',
			new GenerationRequest(request).toPublic(),
		);
	}

	@Get(':id/images')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getRequestImages(
		@Param('orgId') orgId: string,
		@Param('id') id: string,
	) {
		const request = await this.requestService.findOne({
			where: { id, organizationId: orgId },
		});

		if (!request) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Request not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		const images = await this.requestService.getImagesByRequest(id);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			images.map((img) => new GeneratedImage(img).toPublic()),
		);
	}
}
