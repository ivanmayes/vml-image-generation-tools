import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AIService } from '../../ai/ai.service';
import {
	AIMessageRole,
	AIMessage,
	AIProvider,
} from '../../_core/third-party/ai';
import { PromptOptimizer, Agent, DEFAULT_OPTIMIZER_PROMPT } from '../entities';
import { DocumentProcessorService } from '../document-processor/document-processor.service';

interface TopIssue {
	problem: string;
	severity: 'critical' | 'major' | 'moderate' | 'minor';
	fix: string;
}

interface JudgeFeedback {
	agentId: string;
	agentName: string;
	feedback: string;
	score: number;
	weight: number;
	topIssue?: TopIssue;
	whatWorked?: string[];
	promptInstructions?: string[];
}

interface OptimizePromptInput {
	originalBrief: string;
	currentPrompt?: string;
	judgeFeedback: JudgeFeedback[];
	previousPrompts?: string[];
	negativePrompts?: string;
	referenceContext?: string;
	hasReferenceImages?: boolean;
}

@Injectable()
export class PromptOptimizerService implements OnModuleInit {
	private readonly logger = new Logger(PromptOptimizerService.name);
	private cachedOptimizer: PromptOptimizer | null = null;

	constructor(
		@InjectRepository(PromptOptimizer)
		private readonly optimizerRepository: Repository<PromptOptimizer>,
		private readonly aiService: AIService,
		private readonly documentProcessorService: DocumentProcessorService,
	) {}

	async onModuleInit() {
		// Ensure the singleton optimizer exists
		await this.getOrCreateOptimizer();
	}

	/**
	 * Get or create the singleton optimizer configuration
	 */
	public async getOrCreateOptimizer(): Promise<PromptOptimizer> {
		if (this.cachedOptimizer) {
			return this.cachedOptimizer;
		}

		let optimizer = await this.optimizerRepository.findOne({ where: {} });

		if (!optimizer) {
			optimizer = this.optimizerRepository.create({
				systemPrompt: DEFAULT_OPTIMIZER_PROMPT,
			});
			optimizer = await this.optimizerRepository.save(optimizer);
			this.logger.log('Created default prompt optimizer configuration');
		}

		this.cachedOptimizer = optimizer;
		return optimizer;
	}

	/**
	 * Update the optimizer configuration
	 */
	public async updateOptimizer(
		updates: Partial<Pick<PromptOptimizer, 'systemPrompt' | 'config'>>,
	): Promise<PromptOptimizer> {
		const optimizer = await this.getOrCreateOptimizer();

		if (updates.systemPrompt !== undefined) {
			optimizer.systemPrompt = updates.systemPrompt;
		}

		if (updates.config !== undefined) {
			optimizer.config = { ...optimizer.config, ...updates.config };
		}

		const saved = await this.optimizerRepository.save(optimizer);
		this.cachedOptimizer = saved;
		return saved;
	}

	/**
	 * Optimize a prompt based on judge feedback
	 */
	public async optimizePrompt(input: OptimizePromptInput): Promise<string> {
		const startTime = Date.now();
		this.logger.log(
			`[OPTIMIZE_START] Brief: "${input.originalBrief.substring(0, 50)}..." | ` +
				`FeedbackCount: ${input.judgeFeedback.length} | ` +
				`PreviousAttempts: ${input.previousPrompts?.length ?? 0}`,
		);

		const optimizer = await this.getOrCreateOptimizer();

		// Build the user message with all context
		const userMessage = this.buildOptimizationMessage(input);
		this.logger.debug(
			`[OPTIMIZE_CONTEXT] MessageLength: ${userMessage.length} chars | ` +
				`HasNegativePrompts: ${!!input.negativePrompts} | ` +
				`HasReferenceContext: ${!!input.referenceContext} | ` +
				`HasReferenceImages: ${!!input.hasReferenceImages}`,
		);

		// Build messages with proper types
		// Use default system prompt if somehow null (defensive coding)
		const systemPrompt = optimizer.systemPrompt || DEFAULT_OPTIMIZER_PROMPT;
		const messages: AIMessage[] = [
			{ role: AIMessageRole.System, content: systemPrompt },
			{ role: AIMessageRole.User, content: userMessage },
		];

		// Call the LLM to generate optimized prompt
		// Use defaults if config is null/undefined (defensive coding)
		const config = optimizer.config ?? {};
		const model = (config.model ?? 'gemini-2.0-flash') as any;
		this.logger.debug(
			`[OPTIMIZE_LLM_CALL] Model: ${model} | ` +
				`Temperature: ${config.temperature ?? 0.7} | ` +
				`MaxTokens: ${config.maxTokens ?? 'default'}`,
		);

		const llmStartTime = Date.now();
		const response = await this.aiService.generateText({
			provider: AIProvider.Google,
			messages,
			temperature: config.temperature ?? 0.7,
			maxTokens: config.maxTokens,
			model,
		});

		const llmTime = Date.now() - llmStartTime;

		// Handle null/undefined response content (defensive coding)
		const optimizedPrompt = (response.content ?? '').trim();
		const totalTime = Date.now() - startTime;

		this.logger.log(
			`[OPTIMIZE_COMPLETE] OutputLength: ${optimizedPrompt.length} chars | ` +
				`LLMTime: ${llmTime}ms | ` +
				`TotalTime: ${totalTime}ms`,
		);
		this.logger.debug(
			`[OPTIMIZE_OUTPUT] Prompt: "${optimizedPrompt.substring(0, 100)}..."`,
		);

		return optimizedPrompt;
	}

	/**
	 * Build the optimization message with all context
	 */
	private buildOptimizationMessage(input: OptimizePromptInput): string {
		const parts: string[] = [];

		// Original brief
		parts.push('## Original Brief');
		parts.push(input.originalBrief);
		parts.push('');

		// Reference image awareness (placed early for high priority)
		if (input.hasReferenceImages) {
			parts.push('## Reference Images');
			parts.push(
				'Reference images are attached to this generation request. The optimized prompt MUST include ' +
					'explicit instructions to match the visual style, composition, colors, and details of the ' +
					'provided reference image(s). Do NOT omit reference image guidance from the prompt.',
			);
			parts.push('');
		}

		// Current prompt (if iterating)
		if (input.currentPrompt) {
			parts.push('## Current Prompt');
			parts.push(input.currentPrompt);
			parts.push('');
		}

		// Extract and prioritize TOP_ISSUES (highest impact first)
		const topIssues = input.judgeFeedback
			.filter((f) => f.topIssue)
			.sort((a, b) => {
				// Sort by severity (critical > major > moderate > minor) then by weight
				const severityOrder = {
					critical: 4,
					major: 3,
					moderate: 2,
					minor: 1,
				};
				const aSeverity =
					severityOrder[a.topIssue?.severity ?? 'minor'];
				const bSeverity =
					severityOrder[b.topIssue?.severity ?? 'minor'];
				if (aSeverity !== bSeverity) return bSeverity - aSeverity;
				return b.weight - a.weight;
			});

		if (topIssues.length > 0) {
			parts.push('## CRITICAL ISSUES TO FIX (Priority Order)');
			parts.push(
				'These are the TOP issues identified by judges. Address them IN ORDER.',
			);
			parts.push('');
			topIssues.forEach((f, i) => {
				const ti = f.topIssue!;
				parts.push(
					`${i + 1}. [${ti.severity.toUpperCase()}] ${f.agentName}: ${ti.problem}`,
				);
				parts.push(`   FIX: ${ti.fix}`);
			});
			parts.push('');
		}

		// Collect what worked (don't break these)
		const allWhatWorked = input.judgeFeedback
			.flatMap((f) => f.whatWorked ?? [])
			.filter((w, i, arr) => arr.indexOf(w) === i); // dedupe

		if (allWhatWorked.length > 0) {
			parts.push('## WHAT WORKED (Preserve These)');
			allWhatWorked.forEach((w) => parts.push(`- ${w}`));
			parts.push('');
		}

		// Negative prompts (if any)
		if (input.negativePrompts) {
			parts.push('## Things to Avoid');
			parts.push(input.negativePrompts);
			parts.push('');
		}

		// Reference context from RAG (if any)
		if (input.referenceContext) {
			parts.push('## Reference Guidelines');
			parts.push(input.referenceContext);
			parts.push('');
		}

		// Full judge feedback (sorted by weight)
		const sortedFeedback = [...input.judgeFeedback].sort(
			(a, b) => b.weight - a.weight,
		);

		parts.push('## Detailed Judge Feedback');
		for (const feedback of sortedFeedback) {
			parts.push(
				`### ${feedback.agentName} (Weight: ${feedback.weight}, Score: ${feedback.score}/100)`,
			);
			parts.push(feedback.feedback);
			parts.push('');
		}

		// Previous prompts (if any, to avoid repetition)
		if (input.previousPrompts?.length) {
			parts.push('## Previous Attempts (avoid repeating)');
			input.previousPrompts.forEach((prompt, i) => {
				parts.push(`Attempt ${i + 1}: ${prompt.substring(0, 200)}...`);
			});
			parts.push('');
		}

		// Collect prompt instructions from judges (exact text to include)
		const allPromptInstructions = input.judgeFeedback
			.flatMap((f) =>
				(f.promptInstructions ?? []).map((instr) => ({
					instruction: instr,
					agentName: f.agentName,
				})),
			)
			.filter(
				(item, i, arr) =>
					arr.findIndex((x) => x.instruction === item.instruction) ===
					i,
			); // dedupe

		if (allPromptInstructions.length > 0) {
			parts.push('## JUDGE PROMPT INSTRUCTIONS (Must Include Verbatim)');
			parts.push(
				'The following are exact text snippets or instructions from judges that MUST appear in the optimized prompt. Include them verbatim—do not paraphrase.',
			);
			parts.push('');
			allPromptInstructions.forEach((item, i) => {
				parts.push(
					`${i + 1}. [from ${item.agentName}]: "${item.instruction}"`,
				);
			});
			parts.push('');
		}

		parts.push('## Task');
		parts.push(
			'Generate an improved image generation prompt. The output MUST be:',
		);
		parts.push(
			'1. At least 500 words, organized into sections: TECHNICAL PARAMETERS, COMPOSITION & NARRATIVE, SETTING & AMBIANCE, KEY OBJECTS, FINAL NOTES',
		);
		parts.push(
			'2. FIRST address the CRITICAL ISSUES listed above, in priority order',
		);
		parts.push(
			'3. PRESERVE what worked well—do not lose successful elements',
		);
		parts.push(
			'4. Include all JUDGE PROMPT INSTRUCTIONS verbatim in the appropriate sections',
		);
		parts.push(
			'5. Incorporate detailed feedback from judges into specific, actionable prompt language',
		);
		if (input.hasReferenceImages) {
			parts.push(
				'6. Include explicit instructions to match the provided reference images',
			);
		}
		parts.push('');
		parts.push(
			'Output ONLY the optimized prompt with section headers. No commentary, no explanations.',
		);

		return parts.join('\n');
	}

	/**
	 * Get RAG context for agents
	 */
	public async getAgentRagContext(
		agents: Agent[],
		query: string,
	): Promise<string> {
		const startTime = Date.now();
		const agentsWithDocs = agents.filter((a) => a.documents?.length);
		this.logger.log(
			`[RAG_CONTEXT_START] Agents: ${agents.length} | ` +
				`WithDocs: ${agentsWithDocs.length} | ` +
				`Query: "${query.substring(0, 50)}..."`,
		);

		const contextParts: string[] = [];
		let totalChunksFound = 0;

		for (const agent of agents) {
			if (!agent.documents?.length) {
				this.logger.debug(
					`[RAG_CONTEXT_SKIP] Agent: ${agent.name} - No documents`,
				);
				continue;
			}

			// Use defaults if ragConfig is null/undefined (defensive coding)
			const ragConfig = agent.ragConfig ?? {
				topK: 5,
				similarityThreshold: 0.7,
			};
			this.logger.debug(
				`[RAG_CONTEXT_SEARCH] Agent: ${agent.name} | ` +
					`Documents: ${agent.documents.length} | ` +
					`TopK: ${ragConfig.topK ?? 5} | ` +
					`Threshold: ${ragConfig.similarityThreshold ?? 0.7}`,
			);

			const results = await this.documentProcessorService.searchChunks(
				agent.id,
				query,
				ragConfig.topK ?? 5,
				ragConfig.similarityThreshold ?? 0.7,
			);

			if (results.length > 0) {
				this.logger.debug(
					`[RAG_CONTEXT_FOUND] Agent: ${agent.name} | ChunksFound: ${results.length}`,
				);
				contextParts.push(
					`### Context from ${agent.name}'s documents:`,
				);
				for (const result of results) {
					contextParts.push(result.chunk.content);
				}
				contextParts.push('');
				totalChunksFound += results.length;
			} else {
				this.logger.debug(
					`[RAG_CONTEXT_EMPTY] Agent: ${agent.name} - No relevant chunks found`,
				);
			}
		}

		const context = contextParts.join('\n');
		const totalTime = Date.now() - startTime;
		this.logger.log(
			`[RAG_CONTEXT_COMPLETE] TotalChunks: ${totalChunksFound} | ` +
				`ContextLength: ${context.length} chars | ` +
				`Time: ${totalTime}ms`,
		);

		return context;
	}
}
