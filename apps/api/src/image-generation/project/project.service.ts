import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';

import { Project } from '../entities';

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

		return qb.getMany();
	}

	public async findOne(id: string, organizationId: string) {
		return this.projectRepository.findOne({
			where: { id, organizationId, deletedAt: IsNull() },
		});
	}

	public async update(
		id: string,
		organizationId: string,
		data: Partial<Project>,
	) {
		const project = await this.projectRepository.findOne({
			where: { id, organizationId, deletedAt: IsNull() },
		});

		if (!project) {
			throw new NotFoundException('Project not found');
		}

		Object.assign(project, data);
		return this.projectRepository.save(project);
	}

	public async softDelete(id: string, organizationId: string) {
		const project = await this.projectRepository.findOne({
			where: { id, organizationId, deletedAt: IsNull() },
		});

		if (!project) {
			throw new NotFoundException('Project not found');
		}

		return this.projectRepository.softDelete(id);
	}
}
