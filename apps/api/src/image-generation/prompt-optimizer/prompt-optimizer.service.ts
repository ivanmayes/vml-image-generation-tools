import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AIService } from '../../ai/ai.service';
import {
	AIMessageRole,
	AIMessage,
	AIProvider,
} from '../../_core/third-party/ai';
import { Agent } from '../../agent/agent.entity';
import { PromptOptimizer, DEFAULT_OPTIMIZER_PROMPT } from '../entities';
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
	topIssues?: TopIssue[];
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

interface BuildEditInstructionInput {
	originalBrief: string;
	topIssues: TopIssue[];
	whatWorked: string[];
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
	 * Build a multi-fix edit instruction from judge feedback.
	 * Addresses up to 5 issues per edit to maximize progress per iteration.
	 */
	public async buildEditInstruction(
		input: BuildEditInstructionInput,
	): Promise<string> {
		const startTime = Date.now();
		this.logger.log(
			`[EDIT_INSTRUCTION_START] TopIssues: ${input.topIssues.length}`,
		);

		if (input.topIssues.length === 0) {
			return `Refine the image quality. Ensure all elements match this description: ${input.originalBrief.substring(0, 200)}. Keep everything else exactly the same.`;
		}

		// Deduplicate issues by problem text similarity, take up to 5
		const seen = new Set<string>();
		const issues = input.topIssues
			.filter((issue) => {
				const key = issue.problem.toLowerCase().substring(0, 50);
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			})
			.slice(0, 5);

		const systemPrompt = `You are an image editing instruction writer. Your job is to convert judge feedback into precise, actionable edit instructions for an AI image editor.

RULES:
- Output ONLY the edit instructions, nothing else
- Address ALL listed issues in a single coherent instruction block
- Use a numbered list: one instruction per issue, 1-2 sentences each
- End with: "Keep everything else exactly the same."
- Be specific about each target element
- Use descriptive visual language, not abstract concepts
- Reference photographic terms when relevant (lighting, composition, depth of field)
- Prioritize: fix the most impactful issues first in the list

EXAMPLE OF GOOD MULTI-FIX INSTRUCTION:
"Fix the following issues:
1. Sharpen the label text — the Coca-Cola script should be fully legible, flowing left-to-right without warping or distortion.
2. Correct the bottle proportions — the glass body should have the classic hobbleskirt silhouette with a height-to-width ratio of approximately 3:1.
3. Warm up the lighting — add soft amber tones from the left side to match the golden-hour mood specified in the brief.
Keep everything else exactly the same."`;

		const issuesList = issues
			.map(
				(issue, i) =>
					`${i + 1}. [${issue.severity.toUpperCase()}] Problem: ${issue.problem}\n   Suggested Fix: ${issue.fix}`,
			)
			.join('\n');

		const userMessage = `## Issues to Fix (${issues.length} issues, priority order)
${issuesList}

## Elements That Work Well (PRESERVE THESE)
${input.whatWorked.length > 0 ? input.whatWorked.map((w) => `- ${w}`).join('\n') : '- No specific elements flagged as working well'}

## Original Brief (for context)
${input.originalBrief.substring(0, 300)}

Write the multi-fix edit instruction now.`;

		const messages: AIMessage[] = [
			{ role: AIMessageRole.System, content: systemPrompt },
			{ role: AIMessageRole.User, content: userMessage },
		];

		const optimizer = await this.getOrCreateOptimizer();
		const config = optimizer.config ?? {};
		const model = (config.model ?? 'gemini-2.0-flash') as any;

		const response = await this.aiService.generateText({
			provider: AIProvider.Google,
			messages,
			temperature: 0.3, // Lower temperature for more focused instructions
			model,
		});

		const instruction = (response.content ?? '').trim();
		const totalTime = Date.now() - startTime;

		this.logger.log(
			`[EDIT_INSTRUCTION_COMPLETE] Length: ${instruction.length} chars | Time: ${totalTime}ms`,
		);

		return instruction;
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

		// Extract and prioritize ALL issues from all judges (highest impact first)
		const severityOrder: Record<string, number> = {
			critical: 4,
			major: 3,
			moderate: 2,
			minor: 1,
		};
		const allIssues = input.judgeFeedback
			.flatMap((f) => {
				const issues = f.topIssues ?? (f.topIssue ? [f.topIssue] : []);
				return issues.map((ti) => ({
					agentName: f.agentName,
					weight: f.weight,
					...ti,
				}));
			})
			.sort((a, b) => {
				const aSev = severityOrder[a.severity ?? 'minor'] ?? 1;
				const bSev = severityOrder[b.severity ?? 'minor'] ?? 1;
				if (aSev !== bSev) return bSev - aSev;
				return b.weight - a.weight;
			});

		if (allIssues.length > 0) {
			parts.push('## CRITICAL ISSUES TO FIX (Priority Order)');
			parts.push(
				'These are the TOP issues identified by judges. Address them IN ORDER.',
			);
			parts.push('');
			allIssues.forEach((ti, i) => {
				parts.push(
					`${i + 1}. [${ti.severity.toUpperCase()}] ${ti.agentName}: ${ti.problem}`,
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
