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
	Query,
	Logger,
	Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';

import { Roles } from '../user/auth/roles.decorator';
import { RolesGuard } from '../user/auth/roles.guard';
import { HasOrganizationAccessGuard } from '../organization/guards/has-organization-access.guard';
import { UserRole } from '../user/user-role.enum';
import { User } from '../user/user.entity';
import { ResponseEnvelope, ResponseStatus } from '../_core/models';
import { UserContext } from '../_core/interfaces/user-context.interface';

import { Project } from './project.entity';
import { ProjectService } from './project.service';
import { ProjectCreateDto, ProjectUpdateDto } from './dtos';

const basePath = 'organization/:orgId/projects';

@ApiTags('Projects')
@Controller(basePath)
export class ProjectController {
	private readonly logger = new Logger(ProjectController.name);

	constructor(private readonly projectService: ProjectService) {}

	@Get()
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getProjects(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Query('spaceId') spaceId?: string,
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

		const projects = await this.projectService.findByOrganization(
			orgId,
			spaceId,
			safeLimit,
			safeOffset,
			userContext,
		);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			projects.map((p) => new Project(p).toPublic()),
		);
	}

	@Get(':id')
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getProject(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Param('id') id: string,
	) {
		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const project = await this.projectService.findOne(
			id,
			orgId,
			userContext,
		);

		if (!project) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Project not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new Project(project).toPublic(),
		);
	}

	@Post()
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async createProject(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Body() createDto: ProjectCreateDto,
	) {
		let project: Project | null = null;
		try {
			project = await this.projectService.create({
				organizationId: orgId,
				name: createDto.name,
				description: createDto.description,
				spaceId: createDto.spaceId,
				settings: createDto.settings ?? {},
				createdBy: req.user?.id ?? undefined,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Unknown error';
			this.logger.error(
				`[PROJECT_CREATE_FAILED] OrgId: ${orgId} | Error: ${message}`,
			);
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`Error creating project: ${message}`,
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		if (!project) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Error creating project.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Project created.',
			new Project(project).toPublic(),
		);
	}

	@Put(':id')
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async updateProject(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Param('id') id: string,
		@Body() updateDto: ProjectUpdateDto,
	) {
		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const project = await this.projectService
			.update(id, orgId, { ...updateDto }, userContext)
			.catch(() => null);

		if (!project) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Project not found or update failed.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Project updated.',
			new Project(project).toPublic(),
		);
	}

	@Delete(':id')
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async deleteProject(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Param('id') id: string,
	) {
		const userContext: UserContext | undefined =
			req.user?.id && req.user?.role
				? { userId: req.user.id, role: req.user.role }
				: undefined;

		const project = await this.projectService
			.softDelete(id, orgId, userContext)
			.catch(() => null);

		if (!project) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Project not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		return new ResponseEnvelope(ResponseStatus.Success, 'Project deleted.');
	}
}
