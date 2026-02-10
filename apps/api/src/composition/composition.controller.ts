import {
	Controller,
	Get,
	Post,
	Patch,
	Delete,
	Body,
	Param,
	Query,
	Req,
	Res,
	UseGuards,
	ParseUUIDPipe,
	BadRequestException,
	NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiParam,
	ApiQuery,
	ApiBearerAuth,
} from '@nestjs/swagger';

import { Roles } from '../user/auth/roles.decorator';
import { RolesGuard } from '../user/auth/roles.guard';
import { HasOrganizationAccessGuard } from '../organization/guards/has-organization-access.guard';
import { UserRole } from '../user/user-role.enum';
import { User } from '../user/user.entity';
import { ResponseEnvelope, ResponseStatus } from '../_core/models';
import { S3 } from '../_core/third-party/aws/aws.s3';

import { CompositionService } from './composition.service';
import { CreateCompositionDto } from './dtos/create-composition.dto';
import { UpdateCompositionDto } from './dtos/update-composition.dto';
import { CreateCompositionVersionDto } from './dtos/create-composition-version.dto';

const basePath = 'organization/:orgId/compositions';

@ApiTags('Compositions')
@ApiBearerAuth()
@Controller(basePath)
export class CompositionController {
	constructor(private readonly compositionService: CompositionService) {}

	@Post()
	@ApiOperation({ summary: 'Create a new composition' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 201, description: 'Composition created' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	async create(
		@Req() req: Request & { user: User },
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Body() dto: CreateCompositionDto,
	) {
		const composition = await this.compositionService.create(
			orgId,
			dto,
			req.user.id ?? undefined,
		);
		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Composition created',
			composition.toPublic(),
		);
	}

	@Get()
	@ApiOperation({ summary: 'List compositions for an organization' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiQuery({ name: 'projectId', required: false, type: 'string' })
	@ApiQuery({ name: 'limit', required: false, type: 'number' })
	@ApiQuery({ name: 'offset', required: false, type: 'number' })
	@ApiResponse({ status: 200, description: 'List of compositions' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	async list(
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Query('projectId') projectId?: string,
		@Query('limit') limit?: string,
		@Query('offset') offset?: string,
	) {
		// Validate projectId as UUID if provided
		if (
			projectId &&
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				projectId,
			)
		) {
			throw new BadRequestException('projectId must be a valid UUID');
		}

		const parsedLimit = limit ? parseInt(limit, 10) : undefined;
		const parsedOffset = offset ? parseInt(offset, 10) : undefined;
		const result = await this.compositionService.findByOrganization(orgId, {
			projectId,
			limit:
				parsedLimit && !Number.isNaN(parsedLimit)
					? parsedLimit
					: undefined,
			offset:
				parsedOffset && !Number.isNaN(parsedOffset)
					? parsedOffset
					: undefined,
		});
		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			data: result.data.map((c) => c.toPublic()),
			total: result.total,
		});
	}

	@Get('signed-url')
	@ApiOperation({ summary: 'Get a presigned S3 URL for a composition asset' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiQuery({ name: 'key', required: true, type: 'string' })
	@ApiResponse({ status: 200, description: 'Signed URL' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	async getSignedUrl(
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Query('key') key: string,
	) {
		if (!key || typeof key !== 'string') {
			throw new BadRequestException('key query parameter is required');
		}

		// Reject path traversal sequences before prefix check
		if (key.includes('..') || key.includes('\0')) {
			throw new BadRequestException(
				'Invalid key: path traversal sequences are not allowed',
			);
		}

		// Validate the key belongs to this organization's compositions folder
		const expectedPrefix = `compositions/${orgId}/`;
		if (!key.startsWith(expectedPrefix)) {
			throw new BadRequestException(
				'Invalid key: must belong to this organization',
			);
		}

		const url = S3.getSignedUrl(key);
		return new ResponseEnvelope(ResponseStatus.Success, undefined, { url });
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a composition by ID' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Composition details' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	async getOne(
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		const composition = await this.compositionService.findOne(orgId, id);
		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			composition.toPublic(),
		);
	}

	@Patch(':id')
	@ApiOperation({ summary: 'Update a composition' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Composition updated' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	async update(
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: UpdateCompositionDto,
	) {
		const composition = await this.compositionService.update(
			orgId,
			id,
			dto,
		);
		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Composition updated',
			composition.toPublic(),
		);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Soft-delete a composition' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Composition deleted' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	async remove(
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		await this.compositionService.softDelete(orgId, id);
		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Composition deleted',
		);
	}

	// ─── Version Endpoints ──────────────────────────────────────────────────────

	@Post(':id/versions')
	@ApiOperation({ summary: 'Create a new composition version' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 201, description: 'Version created' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	async createVersion(
		@Req() req: Request & { user: User },
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: CreateCompositionVersionDto,
	) {
		const version = await this.compositionService.createVersion(
			orgId,
			id,
			dto,
			req.user.id ?? undefined,
		);
		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Version created',
			version.toPublic(),
		);
	}

	@Get(':id/versions')
	@ApiOperation({ summary: 'List versions for a composition' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiQuery({ name: 'limit', required: false, type: 'number' })
	@ApiQuery({ name: 'offset', required: false, type: 'number' })
	@ApiResponse({ status: 200, description: 'List of versions' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	async listVersions(
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Query('limit') limit?: string,
		@Query('offset') offset?: string,
	) {
		// Verify composition belongs to this org before listing versions
		await this.compositionService.findOne(orgId, id);

		const parsedLimit = limit ? parseInt(limit, 10) : undefined;
		const parsedOffset = offset ? parseInt(offset, 10) : undefined;
		const result = await this.compositionService.findVersionsByComposition(
			id,
			{
				limit:
					parsedLimit && !Number.isNaN(parsedLimit)
						? parsedLimit
						: undefined,
				offset:
					parsedOffset && !Number.isNaN(parsedOffset)
						? parsedOffset
						: undefined,
			},
		);
		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			data: result.data.map((v) => v.toPublic()),
			total: result.total,
		});
	}

	@Get(':id/versions/:versionId')
	@ApiOperation({ summary: 'Get a specific composition version' })
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Version details' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	async getVersion(
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Param('versionId', ParseUUIDPipe) versionId: string,
	) {
		// Verify composition belongs to this org before fetching version
		await this.compositionService.findOne(orgId, id);

		const version = await this.compositionService.findVersion(
			id,
			versionId,
		);
		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			version.toPublic(),
		);
	}

	@Get(':id/versions/:versionId/image')
	@ApiOperation({
		summary: 'Proxy a version image from S3 (same-origin)',
	})
	@ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Image binary' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	async getVersionImage(
		@Param('orgId', ParseUUIDPipe) orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Param('versionId', ParseUUIDPipe) versionId: string,
		@Res() res: Response,
	) {
		await this.compositionService.findOne(orgId, id);
		const version = await this.compositionService.findVersion(
			id,
			versionId,
		);

		if (!version.baseImageS3Key) {
			throw new NotFoundException('Version has no image');
		}

		const stream = S3.getObject(version.baseImageS3Key);
		res.set('Content-Type', 'image/jpeg');
		res.set('Cache-Control', 'private, max-age=3600');
		stream.pipe(res);
	}
}
