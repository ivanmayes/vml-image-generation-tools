import {
	Controller,
	Get,
	Post,
	Delete,
	Body,
	Param,
	UseGuards,
	UseInterceptors,
	UploadedFile,
	HttpException,
	HttpStatus,
	Req,
	Query,
	Sse,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Roles } from '../../user/auth/roles.decorator';
import { RolesGuard } from '../../user/auth/roles.guard';
import { HasOrganizationAccessGuard } from '../../organization/guards/has-organization-access.guard';
import { UserRole } from '../../user/user-role.enum';
import { User } from '../../user/user.entity';
import { ResponseEnvelope, ResponseStatus } from '../../_core/models';
import { AgentService } from '../agent/agent.service';
import { JobQueueService } from '../jobs/job-queue.service';
import {
	GenerationEventsService,
	GenerationEventType,
	SseMessageEvent,
} from '../orchestration/generation-events.service';
import {
	GenerationRequest,
	GenerationRequestStatus,
	GeneratedImage,
} from '../entities';

import { GenerationRequestService } from './generation-request.service';
import { RequestCreateDto, RequestContinueDto } from './dtos';

const basePath = 'organization/:orgId/image-generation/requests';

@Controller(basePath)
export class GenerationRequestController {
	constructor(
		private readonly requestService: GenerationRequestService,
		private readonly agentService: AgentService,
		private readonly jobQueueService: JobQueueService,
		private readonly generationEventsService: GenerationEventsService,
	) {}

	@Get()
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getRequests(
		@Param('orgId') orgId: string,
		@Query('status') status?: GenerationRequestStatus,
		@Query('projectId') projectId?: string,
		@Query('spaceId') spaceId?: string,
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
			projectId,
			spaceId,
		);

		// Batch-fetch final image URLs for card thumbnails
		const finalImageIds = requests
			.map((r) => r.finalImageId)
			.filter((id): id is string => !!id);
		const images = await this.requestService.getImagesByIds(finalImageIds);
		const imageUrlMap = new Map(images.map((img) => [img.id, img.s3Url]));

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			requests.map((r) => {
				const entity = new GenerationRequest(r);
				return {
					...entity.toPublic(),
					finalImageUrl: r.finalImageId
						? imageUrlMap.get(r.finalImageId)
						: undefined,
					bestScore: entity.getBestScore() || undefined,
				};
			}),
		);
	}

	@Get('images')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getOrganizationImages(
		@Param('orgId') orgId: string,
		@Query('limit') limit?: string,
		@Query('offset') offset?: string,
	) {
		const parsedLimit = limit ? parseInt(limit, 10) : 50;
		const parsedOffset = offset ? parseInt(offset, 10) : 0;
		const safeLimit = Number.isNaN(parsedLimit)
			? 50
			: Math.min(parsedLimit, 100);
		const safeOffset = Number.isNaN(parsedOffset)
			? 0
			: Math.max(parsedOffset, 0);

		const images = await this.requestService.findImagesByOrganization(
			orgId,
			safeLimit,
			safeOffset,
		);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			images.map((img) => new GeneratedImage(img).toPublic()),
		);
	}

	@Post('images/upload')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	@UseInterceptors(FileInterceptor('file'))
	public async uploadComplianceImage(
		@Param('orgId') orgId: string,
		@UploadedFile() file: Express.Multer.File,
	) {
		if (!file) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'No file provided.',
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
		if (!allowedMimeTypes.includes(file.mimetype)) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Invalid file type. Accepted: JPEG, PNG, WebP.',
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		const extMap: Record<string, string> = {
			'image/jpeg': 'jpg',
			'image/png': 'png',
			'image/webp': 'webp',
		};

		const url = await this.requestService.uploadComplianceImage(
			orgId,
			file.buffer,
			file.mimetype,
			extMap[file.mimetype],
		);

		return new ResponseEnvelope(ResponseStatus.Success, undefined, { url });
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

	@Sse(':id/stream')
	public async streamRequest(
		@Param('orgId') orgId: string,
		@Param('id') id: string,
		@Query('token') token: string,
		@Req() req: Request,
	): Promise<Observable<SseMessageEvent>> {
		// Auth via query param since EventSource can't send headers
		if (!token) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Authentication token required as query parameter.',
				),
				HttpStatus.UNAUTHORIZED,
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

		// Send full current state as first event (solves race condition)
		const images = await this.requestService.getImagesByRequest(id);
		this.generationEventsService.emit(
			id,
			GenerationEventType.INITIAL_STATE,
			{
				request: new GenerationRequest(request).toDetailed(),
				images: images.map((img) => new GeneratedImage(img).toPublic()),
			},
		);

		// Detect client disconnect for cleanup
		(req as any).on('close', () => {
			// Cleanup is handled by the Observable finalize in GenerationEventsService
		});

		// Subscribe to SSE events and map to MessageEvent format
		return this.generationEventsService.subscribe(id).pipe(
			map((event) => ({
				data: event,
				type: event.type,
				id: `${id}-${Date.now()}`,
			})),
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
				projectId: createDto.projectId,
				spaceId: createDto.spaceId,
				brief: createDto.brief,
				initialPrompt: createDto.initialPrompt,
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

	@Post(':id/continue')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async continueRequest(
		@Param('orgId') orgId: string,
		@Param('id') id: string,
		@Body() continueDto: RequestContinueDto,
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

		// Can only continue completed or failed requests
		const continuableStatuses = [
			GenerationRequestStatus.COMPLETED,
			GenerationRequestStatus.FAILED,
		];

		if (!continuableStatuses.includes(request.status)) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`Cannot continue request with status: ${request.status}`,
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		// Prepare request for continuation
		const updated = await this.requestService.prepareForContinuation(
			id,
			continueDto.additionalIterations ?? 5,
			continueDto.judgeIds,
			continueDto.promptOverride,
		);

		// Queue for processing
		await this.jobQueueService.queueGenerationRequest(id, orgId);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Request continued and queued for processing.',
			new GenerationRequest(updated).toPublic(),
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
