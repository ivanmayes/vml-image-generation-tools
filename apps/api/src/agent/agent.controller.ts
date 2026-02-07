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
import * as AWS from 'aws-sdk';

import { Roles } from '../user/auth/roles.decorator';
import { RolesGuard } from '../user/auth/roles.guard';
import { HasOrganizationAccessGuard } from '../organization/guards/has-organization-access.guard';
import { UserRole } from '../user/user-role.enum';
import { User } from '../user/user.entity';
import { ResponseEnvelope, ResponseStatus } from '../_core/models';

import { Agent } from './agent.entity';
import { AgentService } from './agent.service';
import { AgentCreateDto, AgentUpdateDto } from './dtos';

const basePath = 'organization/:orgId/agents';

@Controller(basePath)
export class AgentController {
	private readonly logger = new Logger(AgentController.name);
	private readonly s3: AWS.S3;

	constructor(private readonly agentService: AgentService) {
		this.s3 = new AWS.S3({
			accessKeyId: process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			region: process.env.AWS_REGION || 'us-east-1',
		});
	}

	@Get()
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getAgents(
		@Param('orgId') orgId: string,
		@Query('query') query?: string,
		@Query('sortBy') sortBy?: string,
		@Query('order') order?: string,
	) {
		const agents = await this.agentService
			.findByOrganization(orgId, query, sortBy, order)
			.catch(() => []);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			agents.map((a) => new Agent(a).toPublic()),
		);
	}

	@Get(':id')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getAgent(
		@Param('orgId') orgId: string,
		@Param('id') id: string,
	) {
		const agent = await this.agentService.getWithDocuments(id, orgId);

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
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
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

		const ragConfig = {
			topK: createDto.ragConfig?.topK ?? 5,
			similarityThreshold:
				createDto.ragConfig?.similarityThreshold ?? 0.7,
		};

		const agent = await this.agentService
			.create({
				organizationId: orgId,
				name: createDto.name,
				systemPrompt: createDto.systemPrompt,
				evaluationCategories: createDto.evaluationCategories,
				optimizationWeight: createDto.optimizationWeight ?? 50,
				scoringWeight: createDto.scoringWeight ?? 50,
				ragConfig,
				templateId: createDto.templateId,
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
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
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

		// Check for agent including soft-delete filter
		const existingAgent = await this.agentService.getWithDocuments(
			id,
			orgId,
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

		// Build the update payload with proper ragConfig handling
		const { ragConfig: _, ...otherFields } = updateDto;
		const updatePayload: Partial<Agent> = {
			...otherFields,
		};

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
			.update(id, updatePayload)
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
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
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

		// Check for agent including soft-delete filter (getWithDocuments filters by deletedAt IS NULL)
		const existingAgent = await this.agentService.getWithDocuments(
			id,
			orgId,
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

		await this.agentService.softDelete(id).catch(() => null);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Agent deleted successfully.',
		);
	}

	@Get(':id/documents')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getDocuments(
		@Param('orgId') orgId: string,
		@Param('id') id: string,
	) {
		const agent = await this.agentService.findOne({
			where: { id, organizationId: orgId },
		});

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
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
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

		const agent = await this.agentService.findOne({
			where: { id, organizationId: orgId },
		});

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

		const s3Key = `agent-documents/${orgId}/${id}/${Date.now()}-${file.originalname}`;

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
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
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

		const agent = await this.agentService.findOne({
			where: { id, organizationId: orgId },
		});

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
}
