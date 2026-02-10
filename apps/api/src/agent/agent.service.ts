import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
	Repository,
	FindOneOptions,
	FindManyOptions,
	FindOptionsWhere,
	IsNull,
} from 'typeorm';

import {
	UserContext,
	isAdminRole,
} from '../_core/interfaces/user-context.interface';

import { Agent, AgentStatus } from './agent.entity';
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
		const entity = this.agentRepository.create({
			canJudge: true,
			status: AgentStatus.ACTIVE,
			capabilities: [],
			teamAgentIds: [],
			ragConfig: { topK: 5, similarityThreshold: 0.7 },
			optimizationWeight: 50,
			scoringWeight: 50,
			...agent,
		});
		return this.agentRepository.save(entity);
	}

	public async update(
		id: string,
		updates: Partial<Agent>,
		organizationId?: string,
	) {
		const where: FindOptionsWhere<Agent> = {
			id,
			deletedAt: IsNull(),
		};

		// Organization scoping is required for security
		if (organizationId) {
			where.organizationId = organizationId;
		}

		const agent = await this.agentRepository.findOne({ where });

		if (!agent) {
			throw new NotFoundException(
				`Agent ${id} not found${organizationId ? ` in organization ${organizationId}` : ''}`,
			);
		}

		Object.assign(agent, updates);
		return this.agentRepository.save(agent);
	}

	public async softDelete(id: string, organizationId?: string) {
		// Remove deleted agent from other agents' teamAgentIds to prevent stale references
		if (organizationId) {
			await this.agentRepository.query(
				`UPDATE image_generation_agents
				 SET "teamAgentIds" = array_remove("teamAgentIds", $1::uuid)
				 WHERE "organizationId" = $2
				 AND $1::uuid = ANY("teamAgentIds")
				 AND "deletedAt" IS NULL`,
				[id, organizationId],
			);
		}
		return this.agentRepository.softDelete(id);
	}

	public async restore(id: string, organizationId: string) {
		const agent = await this.agentRepository.findOne({
			where: { id, organizationId },
			withDeleted: true,
		});

		if (!agent) {
			throw new NotFoundException('Agent not found');
		}

		if (!agent.deletedAt) {
			return agent;
		}

		await this.agentRepository.restore(id);
		agent.deletedAt = null;
		return agent;
	}

	public async findOneWithTeam(
		id: string,
		organizationId: string,
		userContext?: UserContext,
	) {
		const where: FindOptionsWhere<Agent> = {
			id,
			organizationId,
			deletedAt: IsNull(),
		};

		if (userContext && !isAdminRole(userContext.role)) {
			where.createdBy = userContext.userId;
		}

		const agent = await this.agentRepository.findOne({
			where,
			relations: ['documents'],
		});

		if (!agent) {
			throw new NotFoundException('Agent not found');
		}

		let teamAgents: Agent[] = [];
		if (agent.teamAgentIds && agent.teamAgentIds.length > 0) {
			teamAgents = await this.findByIds(
				agent.teamAgentIds,
				organizationId,
			);
		}

		return { ...agent, teamAgents };
	}

	public async findByOrganization(
		organizationId: string,
		query?: string,
		sortBy?: string,
		sortOrder?: string,
		status?: AgentStatus,
		canJudge?: boolean,
		userContext?: UserContext,
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

		if (status) {
			qb.andWhere('agent.status = :status', { status });
		}

		if (canJudge !== undefined) {
			qb.andWhere('agent.canJudge = :canJudge', { canJudge });
		}

		if (userContext && !isAdminRole(userContext.role)) {
			qb.andWhere('agent.createdBy = :userId', {
				userId: userContext.userId,
			});
		}

		// Whitelist allowed sort fields to prevent SQL injection
		const allowedSortFields = [
			'createdAt',
			'updatedAt',
			'name',
			'optimizationWeight',
			'scoringWeight',
			'status',
			'agentType',
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

	public async getWithDocuments(
		id: string,
		organizationId: string,
		userContext?: UserContext,
	) {
		const where: FindOptionsWhere<Agent> = {
			id,
			organizationId,
			deletedAt: IsNull(),
		};

		if (userContext && !isAdminRole(userContext.role)) {
			where.createdBy = userContext.userId;
		}

		return this.agentRepository.findOne({
			where,
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
