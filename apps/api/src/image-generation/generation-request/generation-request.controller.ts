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
	ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiParam,
	ApiBody,
	ApiQuery,
	ApiBearerAuth,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Roles } from '../../user/auth/roles.decorator';
import { RolesGuard } from '../../user/auth/roles.guard';
import { HasOrganizationAccessGuard } from '../../organization/guards/has-organization-access.guard';
import { UserRole } from '../../user/user-role.enum';
import { User } from '../../user/user.entity';
import { AuthService } from '../../user/auth/auth.service';
import { ResponseEnvelope, ResponseStatus } from '../../_core/models';
import { UserContext } from '../../_core/interfaces/user-context.interface';
import { AgentService } from '../../agent/agent.service';
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
	GenerationMode,
} from '../entities';
import { getImageDimensions } from '../utils/image-processing.utils';

import { GenerationRequestService } from './generation-request.service';
import { RequestCreateDto, RequestContinueDto } from './dtos';

const basePath = 'organization/:orgId/image-generation/requests';

@ApiTags('Image Generation Requests')
@ApiBearerAuth()
@Controller(basePath)
export class GenerationRequestController {
	constructor(
		private readonly requestService: GenerationRequestService,
		private readonly agentService: AgentService,
		private readonly jobQueueService: JobQueueService,
		private readonly generationEventsService: GenerationEventsService,
		private readonly jwtService: JwtService,
		private readonly authService: AuthService,
	) {}

	@Get()
	@ApiOperation({ summary: 'List generation requests for an organization' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiQuery({
		name: 'status',
		required: false,
		enum: GenerationRequestStatus,
	})
	@ApiQuery({ name: 'projectId', required: false, type: 'string' })
	@ApiQuery({ name: 'spaceId', required: false, type: 'string' })
	@ApiQuery({ name: 'limit', required: false, type: 'number' })
	@ApiQuery({ name: 'offset', required: false, type: 'number' })
	@ApiResponse({ status: 200, description: 'List of generation requests' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getRequests(
		@Req() req: Request & { user: User },
		@Param('orgId', ParseUUIDPipe) orgId: string,
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

		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const requests = await this.requestService.findByOrganization(
			orgId,
			status,
			safeLimit,
			safeOffset,
			projectId,
			spaceId,
			userContext,
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
	@ApiOperation({ summary: 'List all generated images for an organization' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiQuery({ name: 'limit', required: false, type: 'number' })
	@ApiQuery({ name: 'offset', required: false, type: 'number' })
	@ApiResponse({ status: 200, description: 'List of generated images' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getOrganizationImages(
		@Req() req: Request & { user: User },
		@Param('orgId', ParseUUIDPipe) orgId: string,
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

		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const images = await this.requestService.findImagesByOrganization(
			orgId,
			safeLimit,
			safeOffset,
			userContext,
		);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			images.map((img) => new GeneratedImage(img).toPublic()),
		);
	}

	@Post('images/upload')
	@ApiOperation({ summary: 'Upload an image for compliance evaluation' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 201, description: 'Image uploaded successfully' })
	@ApiResponse({ status: 400, description: 'Invalid file type or no file' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	@UseInterceptors(FileInterceptor('file'))
	public async uploadComplianceImage(
		@Param('orgId', ParseUUIDPipe) orgId: string,
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

		const [url, dimensions] = await Promise.all([
			this.requestService.uploadComplianceImage(
				orgId,
				file.buffer,
				file.mimetype,
				extMap[file.mimetype],
			),
			getImageDimensions(file.buffer),
		]);

		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			url,
			width: dimensions.width,
			height: dimensions.height,
		});
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a generation request by ID' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Generation request details' })
	@ApiResponse({ status: 404, description: 'Request not found' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getRequest(
		@Req() req: Request & { user: User },
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const request = await this.requestService.getWithImages(
			id,
			orgId,
			userContext,
		);

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
	@ApiOperation({
		summary: 'Stream generation request events via SSE',
		description: `
Subscribe to real-time Server-Sent Events (SSE) for a generation request. Returns a stream of events tracking the request lifecycle.

**Event Types:**
- \`initial_state\`: Full current state sent immediately on connection (includes request and images)
- \`status_change\`: Status updated (pending, optimizing, generating, evaluating)
- \`iteration_complete\`: One iteration finished (includes new images and scores)
- \`completed\`: Request completed successfully
- \`failed\`: Request failed with error

**Authentication:**
Since EventSource API cannot send custom headers, authentication is via \`?token=<JWT>\` query parameter.

**Connection:**
\`\`\`javascript
const eventSource = new EventSource('/organization/{orgId}/image-generation/requests/{id}/stream?token=YOUR_JWT');
eventSource.addEventListener('iteration_complete', (e) => {
  const data = JSON.parse(e.data);
  console.log('Iteration:', data.iteration.iterationNumber);
});
\`\`\`
		`,
	})
	@ApiParam({
		name: 'orgId',
		type: 'string',
		format: 'uuid',
		description: 'Organization ID',
	})
	@ApiParam({
		name: 'id',
		type: 'string',
		format: 'uuid',
		description: 'Generation request ID',
	})
	@ApiQuery({
		name: 'token',
		required: true,
		description:
			'JWT authentication token (required as query param for EventSource compatibility)',
		example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
	})
	@ApiResponse({
		status: 200,
		description: 'SSE event stream successfully established',
		schema: {
			type: 'object',
			properties: {
				type: {
					type: 'string',
					enum: [
						'initial_state',
						'status_change',
						'iteration_complete',
						'completed',
						'failed',
					],
					description: 'Event type identifier',
				},
				data: {
					type: 'object',
					description:
						'Event payload (structure varies by event type)',
				},
			},
			example: {
				type: 'iteration_complete',
				data: {
					iteration: {
						iterationNumber: 3,
						optimizedPrompt: 'A cinematic...',
						aggregateScore: 78.5,
						selectedImageId: 'uuid-here',
					},
					imageIds: ['uuid1', 'uuid2', 'uuid3'],
					strategy: 'regenerate',
				},
			},
		},
	})
	@ApiResponse({
		status: 401,
		description:
			'Invalid or expired authentication token, or organization access denied',
	})
	@ApiResponse({
		status: 404,
		description: 'Generation request not found or access denied',
	})
	public async streamRequest(
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
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

		// Validate JWT and verify user has access to this organization
		let sseUser: User | null = null;
		try {
			const payload = this.jwtService.verify(token);
			sseUser = await this.authService.validateUser(token, payload);
			if (!sseUser || sseUser.organizationId !== orgId) {
				throw new Error('Organization access denied');
			}
		} catch {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Invalid or expired authentication token.',
				),
				HttpStatus.UNAUTHORIZED,
			);
		}

		// Build user context for ownership scoping
		const sseUserContext: UserContext | undefined =
			sseUser?.id && sseUser?.role
				? { userId: sseUser.id, role: sseUser.role }
				: undefined;

		const request = await this.requestService.findOneScoped(
			id,
			orgId,
			sseUserContext,
		);

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
	@ApiOperation({ summary: 'Create a new generation request' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiBody({ type: RequestCreateDto })
	@ApiResponse({ status: 201, description: 'Generation request created' })
	@ApiResponse({ status: 400, description: 'Invalid judge IDs' })
	@ApiResponse({ status: 403, description: 'Organization access denied' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async createRequest(
		@Req() req: Request & { user: User },
		@Param('orgId', ParseUUIDPipe) orgId: string,
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

		const nonJudgeAgents = agents.filter((a) => !a.canJudge);
		if (nonJudgeAgents.length > 0) {
			const names = nonJudgeAgents.map((a) => a.name).join(', ');
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`The following agents are not configured as judges: ${names}`,
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		const request = await this.requestService
			.create({
				organizationId: orgId,
				projectId: createDto.projectId,
				spaceId: createDto.spaceId,
				createdBy: req.user?.id ?? undefined,
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
				generationMode:
					createDto.generationMode ?? GenerationMode.REGENERATION,
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
	@ApiOperation({ summary: 'Cancel a generation request' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Request cancelled' })
	@ApiResponse({ status: 400, description: 'Request cannot be cancelled' })
	@ApiResponse({ status: 404, description: 'Request not found' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async cancelRequest(
		@Req() req: Request & { user: User },
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
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

		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const request = await this.requestService.findOneScoped(
			id,
			orgId,
			userContext,
		);

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
	@ApiOperation({ summary: 'Trigger a pending generation request' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Request triggered' })
	@ApiResponse({
		status: 400,
		description: 'Request is not in pending state',
	})
	@ApiResponse({ status: 404, description: 'Request not found' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async triggerRequest(
		@Req() req: Request & { user: User },
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const request = await this.requestService.findOneScoped(
			id,
			orgId,
			userContext,
		);

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
	@ApiOperation({
		summary: 'Continue a completed or failed generation request',
	})
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiBody({ type: RequestContinueDto })
	@ApiResponse({
		status: 200,
		description: 'Request continued and re-queued',
	})
	@ApiResponse({ status: 400, description: 'Request cannot be continued' })
	@ApiResponse({ status: 404, description: 'Request not found' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async continueRequest(
		@Req() req: Request & { user: User },
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() continueDto: RequestContinueDto,
	) {
		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const request = await this.requestService.findOneScoped(
			id,
			orgId,
			userContext,
		);

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

		// Validate new judge IDs if provided
		if (continueDto.judgeIds?.length) {
			const judges = await this.agentService.findByIds(
				continueDto.judgeIds,
				orgId,
			);
			const nonJudges = judges.filter((a) => !a.canJudge);
			if (nonJudges.length > 0) {
				const names = nonJudges.map((a) => a.name).join(', ');
				throw new HttpException(
					new ResponseEnvelope(
						ResponseStatus.Failure,
						`The following agents are not configured as judges: ${names}`,
					),
					HttpStatus.BAD_REQUEST,
				);
			}
		}

		// Prepare request for continuation
		const updated = await this.requestService.prepareForContinuation(
			id,
			continueDto.additionalIterations ?? 5,
			continueDto.judgeIds,
			continueDto.promptOverride,
			continueDto.generationMode,
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
	@ApiOperation({ summary: 'Get all images for a generation request' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'List of generated images' })
	@ApiResponse({ status: 404, description: 'Request not found' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getRequestImages(
		@Req() req: Request & { user: User },
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const request = await this.requestService.findOneScoped(
			id,
			orgId,
			userContext,
		);

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
