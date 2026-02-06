import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';

/**
 * Optimizer configuration options
 */
export interface OptimizerConfig {
	model?: string; // Default: gemini-2.0-flash
	temperature?: number; // Default: 0.7
	maxTokens?: number;
}

/**
 * Default system prompt for the optimizer
 */
export const DEFAULT_OPTIMIZER_PROMPT = `You are an expert prompt optimizer for AI image generation.

Your task is to synthesize feedback from multiple judge agents into a single, optimized image generation prompt.

Guidelines:
1. Combine suggestions from all judges while resolving any conflicts
2. Prioritize feedback based on judge weights (higher weight = more influence)
3. Output ONLY the optimized prompt - no explanations or rationale
4. Preserve the core intent from the original brief
5. Incorporate specific technical details (lighting, composition, style) when suggested
6. If there was previous feedback, address the issues mentioned

The output should be a clear, detailed prompt ready for image generation.`;

/**
 * PromptOptimizer entity - global singleton configuration for prompt synthesis.
 * This entity stores the system prompt and config used to combine judge suggestions.
 */
@Entity('image_generation_prompt_optimizer')
export class PromptOptimizer {
	[key: string]: unknown;

	constructor(value?: Partial<PromptOptimizer>) {
		if (value) {
			value = structuredClone(value);
		}
		for (const k in value) {
			this[k] = value[k];
		}
	}

	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('text', { default: DEFAULT_OPTIMIZER_PROMPT })
	systemPrompt!: string;

	@Column('jsonb', {
		default: {
			model: 'gemini-2.0-flash',
			temperature: 0.7,
		},
	})
	config!: OptimizerConfig;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: Date;

	/**
	 * Public representation
	 */
	public toPublic() {
		return {
			id: this.id,
			systemPrompt: this.systemPrompt,
			config: this.config,
			updatedAt: this.updatedAt,
		};
	}
}
