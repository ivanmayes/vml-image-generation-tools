import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOneOptions, FindManyOptions, IsNull } from 'typeorm';

import { Agent } from './agent.entity';
import { AgentDocument } from './agent-document.entity';

@Injectable()
export class AgentService {
	constructor(
		@InjectRepository(Agent)
		private readonly agentRepository: Repository<Agent>,
		@InjectRepository(AgentDocument)
		private readonly documentRepository: Repository<AgentDocument>,
	) {}

	public async find(options: FindManyOptions<Agent>) {
		return this.agentRepository.find(options);
	}

	public async findOne(options: FindOneOptions<Agent>) {
		return this.agentRepository.findOne(options);
	}

	public async create(agent: Partial<Agent>) {
		const entity = this.agentRepository.create(agent);
		return this.agentRepository.save(entity);
	}

	public async update(id: string, updates: Partial<Agent>) {
		const agent = await this.agentRepository.findOne({
			where: { id, deletedAt: IsNull() },
		});

		if (!agent) {
			throw new NotFoundException('Agent not found');
		}

		Object.assign(agent, updates);
		return this.agentRepository.save(agent);
	}

	public async softDelete(id: string) {
		return this.agentRepository.softDelete(id);
	}

	public async findByOrganization(
		organizationId: string,
		query?: string,
		sortBy?: string,
		sortOrder?: string,
	) {
		const qb = this.agentRepository
			.createQueryBuilder('agent')
			.where('agent.organizationId = :organizationId', { organizationId })
			.andWhere('agent.deletedAt IS NULL');

		if (query && query.trim()) {
			qb.andWhere('LOWER(agent.name) LIKE LOWER(:query)', {
				query: `%${query}%`,
			});
		}

		// Whitelist allowed sort fields to prevent SQL injection
		const allowedSortFields = [
			'createdAt',
			'name',
			'optimizationWeight',
			'scoringWeight',
		];
		const field = allowedSortFields.includes(sortBy ?? '')
			? sortBy!
			: 'createdAt';
		const order = (sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as
			| 'ASC'
			| 'DESC';
		qb.orderBy(`agent.${field}`, order);

		return qb.getMany();
	}

	public async findByIds(ids: string[], organizationId: string) {
		// Handle empty array - TypeORM generates invalid SQL for IN () with empty arrays
		if (!ids || ids.length === 0) {
			return [];
		}

		return this.agentRepository
			.createQueryBuilder('agent')
			.where('agent.id IN (:...ids)', { ids })
			.andWhere('agent.organizationId = :organizationId', {
				organizationId,
			})
			.andWhere('agent.deletedAt IS NULL')
			.getMany();
	}

	public async getWithDocuments(id: string, organizationId: string) {
		return this.agentRepository.findOne({
			where: { id, organizationId, deletedAt: IsNull() },
			relations: ['documents'],
		});
	}

	public async addDocument(
		agentId: string,
		document: Partial<AgentDocument>,
	) {
		const entity = this.documentRepository.create({
			...document,
			agentId,
		});
		return this.documentRepository.save(entity);
	}

	public async getDocuments(agentId: string) {
		return this.documentRepository.find({
			where: { agentId },
			order: { createdAt: 'DESC' },
		});
	}

	public async getDocument(documentId: string, agentId: string) {
		return this.documentRepository.findOne({
			where: { id: documentId, agentId },
		});
	}

	public async deleteDocument(documentId: string) {
		return this.documentRepository.delete(documentId);
	}

	public async updateDocumentChunks(
		documentId: string,
		chunks: AgentDocument['chunks'],
	) {
		// Ensure chunks array is valid (defensive coding)
		const safeChunks = chunks ?? [];
		return this.documentRepository.update(documentId, {
			chunks: safeChunks,
			chunkCount: safeChunks.length,
			metadata: {
				processingStatus: 'completed',
			},
		});
	}

	public async setDocumentProcessingError(documentId: string, error: string) {
		const document = await this.documentRepository.findOne({
			where: { id: documentId },
		});

		if (document) {
			document.metadata = {
				...document.metadata,
				processingStatus: 'failed',
				processingError: error,
			};
			await this.documentRepository.save(document);
		}
	}
}
