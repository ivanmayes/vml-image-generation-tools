import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	Index,
	OneToMany,
	DeleteDateColumn,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';
import { z } from 'zod';

import { Organization } from '../organization/organization.entity';
import { User } from '../user/user.entity';

import { AgentDocument } from './agent-document.entity';

/**
 * Zod schema for runtime validation of RAG configuration
 */
export const RagConfigSchema = z.object({
	topK: z.number().min(1).max(20).default(5),
	similarityThreshold: z.number().min(0).max(1).default(0.7),
});

export type RagConfig = z.infer<typeof RagConfigSchema>;

/**
 * Agent type: EXPERT uses full context, AUDIENCE uses summarized context.
 */
export enum AgentType {
	EXPERT = 'EXPERT',
	AUDIENCE = 'AUDIENCE',
}

/**
 * Model tier for agent LLM selection.
 */
export enum ModelTier {
	PRO = 'PRO',
	FLASH = 'FLASH',
}

/**
 * Thinking level for agent reasoning depth.
 */
export enum ThinkingLevel {
	LOW = 'LOW',
	MEDIUM = 'MEDIUM',
	HIGH = 'HIGH',
}

/**
 * Agent operational status.
 */
export enum AgentStatus {
	ACTIVE = 'ACTIVE',
	INACTIVE = 'INACTIVE',
}

/**
 * Agent entity representing both evaluation judges and general-purpose agents.
 * Each agent belongs to an organization and can have reference documents for RAG.
 */
@Entity('image_generation_agents')
@Index(['organizationId'])
@Index(['organizationId', 'deletedAt'])
@Index(['status'])
@Index(['organizationId', 'status'])
@Index(['organizationId', 'createdBy'])
export class Agent {
	constructor(value?: Partial<Agent>) {
		if (value) {
			Object.assign(this, structuredClone(value));
		}
	}

	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('uuid')
	organizationId!: string;

	@ManyToOne(() => Organization, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'organizationId' })
	organization!: Organization;

	@Column('text')
	name!: string;

	@Column('text')
	systemPrompt!: string;

	@Column('text', { nullable: true })
	evaluationCategories?: string;

	@Column('int', { default: 50 })
	optimizationWeight!: number;

	@Column('int', { default: 50 })
	scoringWeight!: number;

	@Column('jsonb', { default: { topK: 5, similarityThreshold: 0.7 } })
	ragConfig!: RagConfig;

	@Column('text', { nullable: true })
	templateId?: string;

	// --- New fields from Ford ABM parity ---

	@Column('boolean', { default: true })
	canJudge!: boolean;

	@Column('text', { nullable: true })
	description?: string;

	@Column('text', { nullable: true })
	teamPrompt?: string;

	@Column('text', { nullable: true })
	aiSummary?: string;

	@Column({
		type: 'enum',
		enum: AgentType,
		nullable: true,
	})
	agentType?: AgentType;

	@Column({
		type: 'enum',
		enum: ModelTier,
		nullable: true,
	})
	modelTier?: ModelTier;

	@Column({
		type: 'enum',
		enum: ThinkingLevel,
		nullable: true,
	})
	thinkingLevel?: ThinkingLevel;

	@Column({
		type: 'enum',
		enum: AgentStatus,
		default: AgentStatus.ACTIVE,
	})
	status!: AgentStatus;

	@Column('jsonb', { default: '[]' })
	capabilities!: string[];

	@Column('uuid', { array: true, default: '{}' })
	teamAgentIds!: string[];

	@Column('float', { nullable: true })
	temperature?: number;

	@Column('int', { nullable: true })
	maxTokens?: number;

	@Column('text', { nullable: true })
	avatarUrl?: string;

	@Column('uuid', { nullable: true })
	createdBy?: string;

	@ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'createdBy' })
	creator?: User;

	// --- Relationships ---

	@OneToMany(() => AgentDocument, (doc) => doc.agent, { eager: false })
	documents?: AgentDocument[];

	// --- Timestamps ---

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: Date;

	@DeleteDateColumn({ type: 'timestamptz', nullable: true })
	deletedAt?: Date | null;

	/**
	 * Validate RAG config with Zod schema
	 */
	public validateRagConfig(): RagConfig {
		return RagConfigSchema.parse(this.ragConfig);
	}

	/**
	 * Public representation of agent (excludes sensitive data)
	 */
	public toPublic() {
		return {
			id: this.id,
			organizationId: this.organizationId,
			name: this.name,
			systemPrompt: this.systemPrompt,
			evaluationCategories: this.evaluationCategories,
			optimizationWeight: this.optimizationWeight,
			scoringWeight: this.scoringWeight,
			ragConfig: this.ragConfig ?? { topK: 5, similarityThreshold: 0.7 },
			templateId: this.templateId,
			canJudge: this.canJudge ?? true,
			description: this.description,
			teamPrompt: this.teamPrompt,
			aiSummary: this.aiSummary,
			agentType: this.agentType,
			modelTier: this.modelTier,
			thinkingLevel: this.thinkingLevel,
			status: this.status ?? AgentStatus.ACTIVE,
			capabilities: this.capabilities ?? [],
			teamAgentIds: this.teamAgentIds ?? [],
			temperature: this.temperature,
			maxTokens: this.maxTokens,
			avatarUrl: this.avatarUrl,
			createdBy: this.createdBy,
			createdAt: this.createdAt,
			updatedAt: this.updatedAt,
		};
	}
}
