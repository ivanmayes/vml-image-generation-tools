import {
	Controller,
	Get,
	Post,
	Put,
	Delete,
	Body,
	Param,
	UseGuards,
	HttpException,
	HttpStatus,
	Logger,
	Req,
	Query,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiBearerAuth,
	ApiParam,
	ApiQuery,
	ApiConsumes,
	ApiBody,
} from '@nestjs/swagger';
import * as AWS from 'aws-sdk';

import { Roles } from '../user/auth/roles.decorator';
import { RolesGuard } from '../user/auth/roles.guard';
import { HasOrganizationAccessGuard } from '../organization/guards/has-organization-access.guard';
import { UserRole } from '../user/user-role.enum';
import { User } from '../user/user.entity';
import { ResponseEnvelope, ResponseStatus } from '../_core/models';
import {
	UserContext,
	isAdminRole,
} from '../_core/interfaces/user-context.interface';

import { Agent, AgentStatus } from './agent.entity';
import { AgentService } from './agent.service';
import { AgentCreateDto, AgentUpdateDto } from './dtos';
import { TeamCycleValidator } from './validators/team-cycle.validator';
import { AgentExportService } from './export/agent-export.service';
import { AgentImportService } from './import/agent-import.service';

const basePath = 'organization/:orgId/agents';

@ApiTags('Agents')
@ApiBearerAuth()
@Controller(basePath)
export class AgentController {
	private readonly logger = new Logger(AgentController.name);
	private readonly s3: AWS.S3;

	constructor(
		private readonly agentService: AgentService,
		private readonly teamCycleValidator: TeamCycleValidator,
		private readonly agentExportService: AgentExportService,
		private readonly agentImportService: AgentImportService,
	) {
		this.s3 = new AWS.S3({
			accessKeyId: process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			region: process.env.AWS_REGION || 'us-east-1',
		});
	}

	@Get()
	@ApiOperation({ summary: 'Get all agents in an organization' })
	@ApiParam({
		name: 'orgId',
		description: 'Organization ID',
		type: 'string',
	})
	@ApiQuery({
		name: 'query',
		required: false,
		description: 'Search query to filter agents by name',
	})
	@ApiQuery({
		name: 'sortBy',
		required: false,
		description: 'Field to sort by',
		enum: [
			'createdAt',
			'updatedAt',
			'name',
			'optimizationWeight',
			'scoringWeight',
			'status',
			'agentType',
		],
	})
	@ApiQuery({ name: 'order', required: false, enum: ['ASC', 'DESC'] })
	@ApiQuery({
		name: 'status',
		required: false,
		enum: AgentStatus,
		description: 'Filter by agent status',
	})
	@ApiQuery({
		name: 'canJudge',
		required: false,
		type: 'boolean',
		description: 'Filter by judge capability',
	})
	@ApiResponse({
		status: 200,
		description: 'List of agents retrieved successfully',
	})
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getAgents(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Query('query') query?: string,
		@Query('sortBy') sortBy?: string,
		@Query('order') order?: string,
		@Query('status') status?: AgentStatus,
		@Query('canJudge') canJudgeStr?: string,
	) {
		const canJudge =
			canJudgeStr === 'true'
				? true
				: canJudgeStr === 'false'
					? false
					: undefined;

		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const agents = await this.agentService
			.findByOrganization(
				orgId,
				query,
				sortBy,
				order,
				status,
				canJudge,
				userContext,
			)
			.catch(() => []);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			agents.map((a) => new Agent(a).toPublic()),
		);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a specific agent by ID' })
	@ApiParam({
		name: 'orgId',
		description: 'Organization ID',
		type: 'string',
	})
	@ApiParam({ name: 'id', description: 'Agent ID', type: 'string' })
	@ApiResponse({ status: 200, description: 'Agent retrieved successfully' })
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Agent not found' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getAgent(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Param('id') id: string,
	) {
		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const agent = await this.agentService.getWithDocuments(
			id,
			orgId,
			userContext,
		);

		if (!agent) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Agent not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new Agent(agent).toPublic(),
		);
	}

	@Post()
	@ApiOperation({ summary: 'Create a new agent' })
	@ApiParam({
		name: 'orgId',
		description: 'Organization ID',
		type: 'string',
	})
	@ApiBody({ type: AgentCreateDto })
	@ApiResponse({ status: 201, description: 'Agent created successfully' })
	@ApiResponse({ status: 400, description: 'Invalid input' })
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 500, description: 'Error creating agent' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async createAgent(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Body() createDto: AgentCreateDto,
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

		// Validate team cycle if teamAgentIds provided
		if (createDto.teamAgentIds?.length) {
			await this.teamCycleValidator.validate(
				'__new__',
				createDto.teamAgentIds,
				orgId,
			);

			// Non-admins can only reference agents they own
			if (req.user?.role && !isAdminRole(req.user.role)) {
				const userContext: UserContext | undefined =
					req.user?.id && req.user?.role
						? { userId: req.user.id, role: req.user.role }
						: undefined;
				const accessChecks = await Promise.all(
					createDto.teamAgentIds.map((tid) =>
						this.agentService.getWithDocuments(
							tid,
							orgId,
							userContext,
						),
					),
				);
				if (accessChecks.some((a) => !a)) {
					throw new HttpException(
						new ResponseEnvelope(
							ResponseStatus.Failure,
							'You do not have access to one or more referenced team agents.',
						),
						HttpStatus.FORBIDDEN,
					);
				}
			}
		}

		const ragConfig = {
			topK: createDto.ragConfig?.topK ?? 5,
			similarityThreshold:
				createDto.ragConfig?.similarityThreshold ?? 0.7,
		};

		const agent = await this.agentService
			.create({
				organizationId: orgId,
				createdBy: req.user?.id ?? undefined,
				name: createDto.name,
				systemPrompt: createDto.systemPrompt,
				evaluationCategories: createDto.evaluationCategories,
				optimizationWeight: createDto.optimizationWeight ?? 50,
				scoringWeight: createDto.scoringWeight ?? 50,
				ragConfig,
				templateId: createDto.templateId,
				canJudge: createDto.canJudge,
				description: createDto.description,
				teamPrompt: createDto.teamPrompt,
				aiSummary: createDto.aiSummary,
				agentType: createDto.agentType,
				modelTier: createDto.modelTier,
				thinkingLevel: createDto.thinkingLevel,
				status: createDto.status,
				capabilities: createDto.capabilities,
				teamAgentIds: createDto.teamAgentIds,
				temperature: createDto.temperature,
				maxTokens: createDto.maxTokens,
				avatarUrl: createDto.avatarUrl,
				judgePrompt: createDto.judgePrompt,
			})
			.catch(() => null);

		if (!agent) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Error creating agent.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new Agent(agent).toPublic(),
		);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update an existing agent' })
	@ApiParam({
		name: 'orgId',
		description: 'Organization ID',
		type: 'string',
	})
	@ApiParam({ name: 'id', description: 'Agent ID', type: 'string' })
	@ApiBody({ type: AgentUpdateDto })
	@ApiResponse({ status: 200, description: 'Agent updated successfully' })
	@ApiResponse({ status: 400, description: 'Invalid input' })
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Agent not found' })
	@ApiResponse({ status: 500, description: 'Error updating agent' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async updateAgent(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Param('id') id: string,
		@Body() updateDto: AgentUpdateDto,
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

		// Build userContext for ownership filtering (non-admins can only update their own agents)
		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		// Check for agent including soft-delete filter + ownership
		const existingAgent = await this.agentService.getWithDocuments(
			id,
			orgId,
			userContext,
		);

		if (!existingAgent) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Agent not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		// Validate team cycle if teamAgentIds are being updated
		if (updateDto.teamAgentIds?.length) {
			await this.teamCycleValidator.validate(
				id,
				updateDto.teamAgentIds,
				orgId,
			);

			// Non-admins can only reference agents they own
			if (userContext && !isAdminRole(userContext.role)) {
				const accessChecks = await Promise.all(
					updateDto.teamAgentIds.map((tid) =>
						this.agentService.getWithDocuments(
							tid,
							orgId,
							userContext,
						),
					),
				);
				if (accessChecks.some((a) => !a)) {
					throw new HttpException(
						new ResponseEnvelope(
							ResponseStatus.Failure,
							'You do not have access to one or more referenced team agents.',
						),
						HttpStatus.FORBIDDEN,
					);
				}
			}
		}

		// Build the update payload with proper ragConfig handling
		const { ragConfig: _, ...otherFields } = updateDto;
		const { judgePrompt: rawJudgePrompt, ...restFields } = otherFields;
		const updatePayload: Partial<Agent> = {
			...restFields,
			// Only include judgePrompt when explicitly provided (null clears, string sets, undefined skips)
			// Keep null as-is so Object.assign + save() writes NULL to the column
			...(rawJudgePrompt !== undefined && {
				judgePrompt: rawJudgePrompt,
			}),
		} as Partial<Agent>;

		// If ragConfig is being updated, ensure all fields are present
		// Use defaults if existing ragConfig is null/undefined (defensive coding)
		if (updateDto.ragConfig) {
			const existingRagConfig = existingAgent.ragConfig ?? {
				topK: 5,
				similarityThreshold: 0.7,
			};
			updatePayload.ragConfig = {
				topK: updateDto.ragConfig.topK ?? existingRagConfig.topK ?? 5,
				similarityThreshold:
					updateDto.ragConfig.similarityThreshold ??
					existingRagConfig.similarityThreshold ??
					0.7,
			};
		}

		const updated = await this.agentService
			.update(id, updatePayload, orgId)
			.catch(() => null);

		if (!updated) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Error updating agent.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new Agent(updated).toPublic(),
		);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Soft delete an agent' })
	@ApiParam({
		name: 'orgId',
		description: 'Organization ID',
		type: 'string',
	})
	@ApiParam({ name: 'id', description: 'Agent ID', type: 'string' })
	@ApiResponse({ status: 200, description: 'Agent deleted successfully' })
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Agent not found' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async deleteAgent(
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

		// Build userContext for ownership filtering (non-admins can only delete their own agents)
		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		// Check for agent including soft-delete filter + ownership
		const existingAgent = await this.agentService.getWithDocuments(
			id,
			orgId,
			userContext,
		);

		if (!existingAgent) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Agent not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		await this.agentService.softDelete(id, orgId).catch(() => null);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Agent deleted successfully.',
		);
	}

	@Get(':id/documents')
	@ApiOperation({ summary: 'Get all documents for an agent' })
	@ApiParam({
		name: 'orgId',
		description: 'Organization ID',
		type: 'string',
	})
	@ApiParam({ name: 'id', description: 'Agent ID', type: 'string' })
	@ApiResponse({
		status: 200,
		description: 'Agent documents retrieved successfully',
	})
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Agent not found' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getDocuments(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Param('id') id: string,
	) {
		// Build userContext for ownership filtering (non-admins can only access their own agents' documents)
		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const agent = await this.agentService.getWithDocuments(
			id,
			orgId,
			userContext,
		);

		if (!agent) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Agent not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		const documents = await this.agentService.getDocuments(id);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			documents.map((d) => d.toPublic()),
		);
	}

	@Post(':id/documents')
	@ApiOperation({ summary: 'Upload a document to an agent for RAG' })
	@ApiParam({
		name: 'orgId',
		description: 'Organization ID',
		type: 'string',
	})
	@ApiParam({ name: 'id', description: 'Agent ID', type: 'string' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		description: 'File to upload',
		schema: {
			type: 'object',
			properties: {
				file: {
					type: 'string',
					format: 'binary',
				},
			},
		},
	})
	@ApiResponse({
		status: 201,
		description: 'Document uploaded successfully',
	})
	@ApiResponse({ status: 400, description: 'No file provided' })
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Agent not found' })
	@ApiResponse({ status: 500, description: 'Error uploading file' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	@UseInterceptors(FileInterceptor('file'))
	public async uploadDocument(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Param('id') id: string,
		@UploadedFile() file: Express.Multer.File,
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

		// Build userContext for ownership filtering (non-admins can only upload to their own agents)
		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const agent = await this.agentService.getWithDocuments(
			id,
			orgId,
			userContext,
		);

		if (!agent) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Agent not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		if (!file) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'No file provided.',
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		const safeName =
			file.originalname
				// eslint-disable-next-line no-control-regex
				.replace(/[\x00-\x1f]/g, '')
				.replace(/[/\\]/g, '_')
				.replace(/\.\./g, '_')
				.replace(/^\.+/, '_')
				.trim() || 'unnamed';
		const s3Key = `agent-documents/${orgId}/${id}/${Date.now()}-${safeName}`;

		try {
			await this.s3
				.putObject({
					Bucket: process.env.AWS_S3_BUCKET!,
					Key: s3Key,
					Body: file.buffer,
					ContentType: file.mimetype,
				})
				.promise();
		} catch {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Error uploading file to storage.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		const document = await this.agentService
			.addDocument(id, {
				filename: file.originalname,
				mimeType: file.mimetype,
				s3Key,
				metadata: {
					fileSize: file.size,
					processingStatus: 'pending',
				},
			})
			.catch(() => null);

		if (!document) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Error uploading document.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Document uploaded. Processing will begin shortly.',
			document.toPublic(),
		);
	}

	@Delete(':id/documents/:documentId')
	@ApiOperation({ summary: 'Delete a document from an agent' })
	@ApiParam({
		name: 'orgId',
		description: 'Organization ID',
		type: 'string',
	})
	@ApiParam({ name: 'id', description: 'Agent ID', type: 'string' })
	@ApiParam({
		name: 'documentId',
		description: 'Document ID',
		type: 'string',
	})
	@ApiResponse({
		status: 200,
		description: 'Document deleted successfully',
	})
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Agent or document not found' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async deleteDocument(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Param('id') id: string,
		@Param('documentId') documentId: string,
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

		// Build userContext for ownership filtering (non-admins can only delete from their own agents)
		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const agent = await this.agentService.getWithDocuments(
			id,
			orgId,
			userContext,
		);

		if (!agent) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Agent not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		const document = await this.agentService.getDocument(documentId, id);

		if (!document) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Document not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		// Delete from S3 first; log but don't fail so the DB record is still cleaned up
		if (document.s3Key) {
			await this.s3
				.deleteObject({
					Bucket: process.env.AWS_S3_BUCKET!,
					Key: document.s3Key,
				})
				.promise()
				.catch((err) => {
					this.logger.warn(
						`Failed to delete S3 object "${document.s3Key}" for document ${documentId}: ${err.message}`,
					);
				});
		}

		await this.agentService.deleteDocument(documentId);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Document deleted successfully.',
		);
	}

	// --- New endpoints ---

	@Get(':id/with-team')
	@ApiOperation({
		summary: 'Get an agent with its team members expanded',
	})
	@ApiParam({
		name: 'orgId',
		description: 'Organization ID',
		type: 'string',
	})
	@ApiParam({ name: 'id', description: 'Agent ID', type: 'string' })
	@ApiResponse({
		status: 200,
		description: 'Agent with team members retrieved successfully',
	})
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Agent not found' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getAgentWithTeam(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Param('id') id: string,
	) {
		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const result = await this.agentService.findOneWithTeam(
			id,
			orgId,
			userContext,
		);

		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			...new Agent(result).toPublic(),
			teamAgents: result.teamAgents.map((a) => new Agent(a).toPublic()),
		});
	}

	@Post(':id/restore')
	@ApiOperation({ summary: 'Restore a soft-deleted agent' })
	@ApiParam({
		name: 'orgId',
		description: 'Organization ID',
		type: 'string',
	})
	@ApiParam({ name: 'id', description: 'Agent ID', type: 'string' })
	@ApiResponse({
		status: 200,
		description: 'Agent restored successfully',
	})
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Agent not found' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async restoreAgent(
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

		const agent = await this.agentService.restore(id, orgId);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Agent restored successfully.',
			new Agent(agent).toPublic(),
		);
	}

	@Get(':id/export')
	@ApiOperation({
		summary: 'Export an agent to .agent file format (ZIP)',
	})
	@ApiParam({
		name: 'orgId',
		description: 'Organization ID',
		type: 'string',
	})
	@ApiParam({ name: 'id', description: 'Agent ID', type: 'string' })
	@ApiResponse({
		status: 200,
		description: 'Agent exported successfully (returns base64 ZIP)',
	})
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Agent not found' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async exportAgent(
		@Param('orgId') orgId: string,
		@Param('id') id: string,
		@Req() req: Request & { user: User },
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

		const { buffer, fileName } =
			await this.agentExportService.exportToAgentFile(id, orgId);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Agent exported successfully.',
			{
				fileName,
				data: buffer.toString('base64'),
				contentType: 'application/zip',
			},
		);
	}

	@Post('import')
	@ApiOperation({ summary: 'Import an agent from .agent file' })
	@ApiParam({
		name: 'orgId',
		description: 'Organization ID',
		type: 'string',
	})
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		description: '.agent file to import',
		schema: {
			type: 'object',
			properties: {
				file: {
					type: 'string',
					format: 'binary',
				},
				nameOverride: {
					type: 'string',
					description: 'Optional name override for imported agent',
				},
				skipDocuments: {
					type: 'boolean',
					description: 'Skip importing documents',
				},
			},
			required: ['file'],
		},
	})
	@ApiResponse({
		status: 201,
		description: 'Agent imported successfully',
	})
	@ApiResponse({
		status: 400,
		description: 'No file provided or invalid file',
	})
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	@UseInterceptors(FileInterceptor('file'))
	public async importAgent(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@UploadedFile() file: Express.Multer.File,
		@Body('nameOverride') nameOverride?: string,
		@Body('skipDocuments') skipDocumentsStr?: string,
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

		if (!file) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'No .agent file provided.',
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		const result = await this.agentImportService.importFromAgentFile(
			file.buffer,
			{
				organizationId: orgId,
				nameOverride,
				skipDocuments: skipDocumentsStr === 'true',
			},
		);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Agent imported successfully.',
			result,
		);
	}

	@Post('validate-import')
	@ApiOperation({ summary: 'Validate an .agent file without importing' })
	@ApiParam({
		name: 'orgId',
		description: 'Organization ID',
		type: 'string',
	})
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		description: '.agent file to validate',
		schema: {
			type: 'object',
			properties: {
				file: {
					type: 'string',
					format: 'binary',
				},
			},
			required: ['file'],
		},
	})
	@ApiResponse({
		status: 200,
		description: 'Validation result returned',
	})
	@ApiResponse({ status: 400, description: 'No file provided' })
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	@UseInterceptors(FileInterceptor('file'))
	public async validateImport(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@UploadedFile() file: Express.Multer.File,
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
		if (!file) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'No .agent file provided.',
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		const result = await this.agentImportService.validateAgentFile(
			file.buffer,
		);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			result.valid
				? 'Agent file is valid.'
				: 'Agent file has validation errors.',
			result,
		);
	}
}
