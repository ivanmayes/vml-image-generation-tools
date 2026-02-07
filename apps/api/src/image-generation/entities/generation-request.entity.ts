import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	Index,
	CreateDateColumn,
	OneToMany,
} from 'typeorm';

import { Organization } from '../../organization/organization.entity';
import { Space } from '../../space/space.entity';

import { GeneratedImage } from './generated-image.entity';
import { Project } from './project.entity';

/**
 * Request status enum
 */
export enum GenerationRequestStatus {
	PENDING = 'pending',
	OPTIMIZING = 'optimizing',
	GENERATING = 'generating',
	EVALUATING = 'evaluating',
	COMPLETED = 'completed',
	FAILED = 'failed',
	CANCELLED = 'cancelled',
}

/**
 * Completion reason for requests
 */
export enum CompletionReason {
	SUCCESS = 'SUCCESS',
	MAX_RETRIES_REACHED = 'MAX_RETRIES_REACHED',
	DIMINISHING_RETURNS = 'DIMINISHING_RETURNS',
	CANCELLED = 'CANCELLED',
	ERROR = 'ERROR',
}

/**
 * Image generation parameters
 */
export interface ImageParams {
	aspectRatio?: string; // e.g., "16:9", "1:1", "4:3"
	quality?: string; // "1K", "2K", "4K"
	imagesPerGeneration: number;
	plateauWindowSize?: number; // default: 3
	plateauThreshold?: number; // default: 0.02
}

/**
 * Cost tracking for the request
 */
export interface RequestCosts {
	llmTokens: number;
	imageGenerations: number;
	embeddingTokens: number;
	totalEstimatedCost: number;
}

/**
 * Individual iteration data (stored as JSONB for consolidation)
 */
export interface IterationSnapshot {
	iterationNumber: number;
	optimizedPrompt: string;
	selectedImageId?: string;
	aggregateScore: number;
	evaluations: AgentEvaluationSnapshot[];
	createdAt: Date;
}

/**
 * Top issue identified by a judge - the single most important thing to fix
 */
export interface TopIssueSnapshot {
	problem: string;
	severity: 'critical' | 'major' | 'moderate' | 'minor';
	fix: string;
}

/**
 * Agent evaluation snapshot
 */
export interface AgentEvaluationSnapshot {
	agentId: string;
	agentName: string;
	imageId: string;
	overallScore: number;
	categoryScores?: Record<string, number>;
	feedback: string;
	weight: number;
	topIssue?: TopIssueSnapshot;
	whatWorked?: string[];
	checklist?: Record<string, { passed: boolean; note?: string }>;
	promptInstructions?: string[];
}

/**
 * GenerationRequest entity - the main request for image generation.
 * Consolidates iterations and evaluations as JSONB snapshots.
 */
@Entity('image_generation_requests')
@Index(['organizationId'])
@Index(['status'])
@Index(['organizationId', 'status'])
@Index(['organizationId', 'projectId'])
export class GenerationRequest {
	[key: string]: unknown;

	constructor(value?: Partial<GenerationRequest>) {
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

	@Column('uuid', { nullable: true })
	projectId?: string;

	@ManyToOne(() => Project, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'projectId' })
	project?: Project;

	@Column('uuid', { nullable: true })
	spaceId?: string;

	@ManyToOne(() => Space, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'spaceId' })
	space?: Space;

	@Column('text')
	brief!: string;

	@Column('text', { nullable: true })
	initialPrompt?: string;

	@Column('jsonb', { nullable: true })
	referenceImageUrls?: string[];

	@Column('text', { nullable: true })
	negativePrompts?: string;

	@Column('uuid', { array: true })
	judgeIds!: string[];

	@Column('jsonb', { default: { imagesPerGeneration: 3 } })
	imageParams!: ImageParams;

	@Column('int', { default: 75 })
	threshold!: number;

	@Column('int', { default: 5 })
	maxIterations!: number;

	@Column({
		type: 'enum',
		enum: GenerationRequestStatus,
		default: GenerationRequestStatus.PENDING,
	})
	status!: GenerationRequestStatus;

	@Column('int', { default: 0 })
	currentIteration!: number;

	@Column('uuid', { nullable: true })
	finalImageId?: string;

	@Column({
		type: 'enum',
		enum: CompletionReason,
		nullable: true,
	})
	completionReason?: CompletionReason;

	@Column('jsonb', { default: [] })
	iterations!: IterationSnapshot[];

	@Column('jsonb', {
		default: {
			llmTokens: 0,
			imageGenerations: 0,
			embeddingTokens: 0,
			totalEstimatedCost: 0,
		},
	})
	costs!: RequestCosts;

	@Column('text', { nullable: true })
	errorMessage?: string;

	@OneToMany(() => GeneratedImage, (image) => image.request, { eager: false })
	images?: GeneratedImage[];

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	@Column({ type: 'timestamptz', nullable: true })
	completedAt?: Date;

	/**
	 * Get the best score achieved across all iterations
	 */
	public getBestScore(): number {
		if (!this.iterations.length) return 0;
		return Math.max(...this.iterations.map((i) => i.aggregateScore));
	}

	/**
	 * Check if score is plateauing (for early termination)
	 */
	public isScorePlateauing(
		windowSize: number = 3,
		threshold: number = 0.02,
	): boolean {
		if (this.iterations.length < windowSize) return false;

		const recentScores = this.iterations
			.slice(-windowSize)
			.map((i) => i.aggregateScore);

		const maxImprovement =
			Math.max(...recentScores) - Math.min(...recentScores);
		return maxImprovement < threshold * Math.max(...recentScores);
	}

	/**
	 * Public representation
	 */
	public toPublic() {
		return {
			id: this.id,
			organizationId: this.organizationId,
			projectId: this.projectId,
			spaceId: this.spaceId,
			brief: this.brief,
			status: this.status,
			currentIteration: this.currentIteration,
			maxIterations: this.maxIterations,
			threshold: this.threshold,
			finalImageId: this.finalImageId,
			completionReason: this.completionReason,
			costs: this.costs,
			createdAt: this.createdAt,
			completedAt: this.completedAt,
		};
	}

	/**
	 * Detailed representation with iterations
	 */
	public toDetailed() {
		return {
			...this.toPublic(),
			initialPrompt: this.initialPrompt,
			referenceImageUrls: this.referenceImageUrls,
			negativePrompts: this.negativePrompts,
			judgeIds: this.judgeIds,
			imageParams: this.imageParams,
			iterations: this.iterations,
			errorMessage: this.errorMessage,
		};
	}
}
