import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, FindOptionsWhere } from 'typeorm';

import {
	UserContext,
	isAdminRole,
} from '../_core/interfaces/user-context.interface';

import { Project } from './project.entity';

@Injectable()
export class ProjectService {
	constructor(
		@InjectRepository(Project)
		private readonly projectRepository: Repository<Project>,
	) {}

	public async create(data: Partial<Project>) {
		const entity = this.projectRepository.create(data);
		return this.projectRepository.save(entity);
	}

	public async findByOrganization(
		organizationId: string,
		spaceId?: string,
		limit: number = 50,
		offset: number = 0,
		userContext?: UserContext,
	) {
		const qb = this.projectRepository
			.createQueryBuilder('project')
			.where('project.organizationId = :organizationId', {
				organizationId,
			})
			.andWhere('project.deletedAt IS NULL')
			.orderBy('project.createdAt', 'DESC')
			.take(limit)
			.skip(offset);

		if (spaceId) {
			qb.andWhere('project.spaceId = :spaceId', { spaceId });
		}

		if (userContext && !isAdminRole(userContext.role)) {
			qb.andWhere('project.createdBy = :userId', {
				userId: userContext.userId,
			});
		}

		return qb.getMany();
	}

	public async findOne(
		id: string,
		organizationId: string,
		userContext?: UserContext,
	) {
		const where: FindOptionsWhere<Project> = {
			id,
			organizationId,
			deletedAt: IsNull(),
		};

		if (userContext && !isAdminRole(userContext.role)) {
			where.createdBy = userContext.userId;
		}

		return this.projectRepository.findOne({ where });
	}

	public async update(
		id: string,
		organizationId: string,
		data: Partial<Project>,
		userContext?: UserContext,
	) {
		const where: FindOptionsWhere<Project> = {
			id,
			organizationId,
			deletedAt: IsNull(),
		};

		if (userContext && !isAdminRole(userContext.role)) {
			where.createdBy = userContext.userId;
		}

		const project = await this.projectRepository.findOne({ where });

		if (!project) {
			throw new NotFoundException('Project not found');
		}

		Object.assign(project, data);
		return this.projectRepository.save(project);
	}

	public async softDelete(
		id: string,
		organizationId: string,
		userContext?: UserContext,
	) {
		const where: FindOptionsWhere<Project> = {
			id,
			organizationId,
			deletedAt: IsNull(),
		};

		if (userContext && !isAdminRole(userContext.role)) {
			where.createdBy = userContext.userId;
		}

		const project = await this.projectRepository.findOne({ where });

		if (!project) {
			throw new NotFoundException('Project not found');
		}

		return this.projectRepository.softDelete(id);
	}
}
