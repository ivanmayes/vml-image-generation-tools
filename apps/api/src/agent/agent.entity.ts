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
} from 'typeorm';
import { z } from 'zod';

import { Organization } from '../organization/organization.entity';

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
 * Agent entity representing a judge agent for image evaluation.
 * Each agent belongs to an organization and can have reference documents for RAG.
 */
@Entity('image_generation_agents')
@Index(['organizationId'])
@Index(['organizationId', 'deletedAt'])
export class Agent {
	[key: string]: unknown;

	constructor(value?: Partial<Agent>) {
		if (value) {
			value = structuredClone(value);
		}
		for (const k in value) {
			this[k] = value[k];
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

	@OneToMany(() => AgentDocument, (doc) => doc.agent, { eager: false })
	documents?: AgentDocument[];

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

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
			ragConfig: this.ragConfig,
			templateId: this.templateId,
			createdAt: this.createdAt,
		};
	}
}
