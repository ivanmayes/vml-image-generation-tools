import { Injectable, Logger } from '@nestjs/common';

import { AIService } from '../../ai/ai.service';
import {
	AIMessageRole,
	AIMessage,
	AIProvider,
} from '../../_core/third-party/ai';
import { Agent } from '../../agent/agent.entity';
import { AgentEvaluationSnapshot, GeneratedImage } from '../entities';
import { DocumentProcessorService } from '../document-processor/document-processor.service';
import { DEFAULT_JUDGE_TEMPLATE } from '../prompts/default-judge-template';

export interface TopIssue {
	problem: string;
	severity: 'critical' | 'major' | 'moderate' | 'minor';
	fix: string;
}

export interface IterationContext {
	currentIteration: number;
	maxIterations: number;
	previousScores: number[];
}

export interface EvaluationResult {
	agentId: string;
	agentName: string;
	imageId: string;
	overallScore: number;
	categoryScores?: Record<string, number>;
	feedback: string;
	weight: number;
	/** @deprecated Use topIssues instead */
	topIssue?: TopIssue;
	/** Ranked list of issues from this judge (most important first) */
	topIssues?: TopIssue[];
	whatWorked?: string[];
	checklist?: Record<string, { passed: boolean; note?: string }>;
	promptInstructions?: string[];
}

export interface AggregatedEvaluation {
	imageId: string;
	aggregateScore: number;
	evaluations: EvaluationResult[];
}

@Injectable()
export class EvaluationService {
	private readonly logger = new Logger(EvaluationService.name);

	constructor(
		private readonly aiService: AIService,
		private readonly documentProcessorService: DocumentProcessorService,
	) {}

	/**
	 * Evaluate an image using a single judge agent
	 */
	public async evaluateImage(
		agent: Agent,
		image: GeneratedImage,
		brief: string,
		organizationId: string,
		iterationContext?: IterationContext,
	): Promise<EvaluationResult> {
		const startTime = Date.now();

		// P0 Security: Validate agent belongs to the request's organization
		if (agent.organizationId !== organizationId) {
			const error = `Agent ${agent.id} does not belong to organization ${organizationId}`;
			this.logger.error(`[EVAL_SECURITY_ERROR] ${error}`);
			throw new Error(error);
		}

		this.logger.log(
			`[EVAL_START] Agent: ${agent.name} | ImageID: ${image.id} | Weight: ${agent.scoringWeight}`,
		);

		// Get RAG context if agent has documents
		let ragContext = '';
		if (agent.documents?.length) {
			// Use defaults if ragConfig is null/undefined (defensive coding)
			const ragConfig = agent.ragConfig ?? {
				topK: 5,
				similarityThreshold: 0.7,
			};
			this.logger.debug(
				`[EVAL_RAG_SEARCH] Agent: ${agent.name} | ` +
					`Documents: ${agent.documents.length} | ` +
					`TopK: ${ragConfig.topK ?? 5} | ` +
					`Threshold: ${ragConfig.similarityThreshold ?? 0.7}`,
			);

			// P2 Issue #6: Wrap RAG search in try/catch to prevent crashes
			try {
				const ragStartTime = Date.now();
				const chunks = await this.documentProcessorService.searchChunks(
					agent.id,
					`${brief} ${image.promptUsed}`,
					ragConfig.topK ?? 5,
					ragConfig.similarityThreshold ?? 0.7,
				);

				if (chunks.length > 0) {
					ragContext =
						'\n\nReference Guidelines:\n' +
						chunks.map((c) => c.chunk.content).join('\n\n');
					this.logger.debug(
						`[EVAL_RAG_FOUND] Agent: ${agent.name} | ` +
							`ChunksFound: ${chunks.length} | ` +
							`ContextLength: ${ragContext.length} chars | ` +
							`Time: ${Date.now() - ragStartTime}ms`,
					);
				} else {
					this.logger.debug(
						`[EVAL_RAG_EMPTY] Agent: ${agent.name} - No relevant chunks found`,
					);
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'Unknown error';
				this.logger.warn(
					`[EVAL_RAG_ERROR] Agent: ${agent.name} | RAG search failed: ${message} | Continuing with empty context`,
				);
				ragContext = '';
			}
		}

		// Build evaluation prompt
		const evaluationPrompt = this.buildEvaluationPrompt(
			agent,
			brief,
			image.promptUsed,
			ragContext,
			iterationContext,
		);
		this.logger.debug(
			`[EVAL_PROMPT] Agent: ${agent.name} | PromptLength: ${evaluationPrompt.length} chars`,
		);

		// Get evaluation from LLM
		const messages: AIMessage[] = [
			{
				role: AIMessageRole.System,
				content: this.composeJudgeSystemMessage(agent),
			},
			{
				role: AIMessageRole.User,
				content: [
					{ type: 'text', text: evaluationPrompt },
					{
						type: 'image',
						image: { url: image.s3Url },
					},
				],
			},
		];

		// P2 Issue #7: Use agent's modelTier instead of hardcoded model
		const model = this.getModelFromTier(agent.modelTier);

		// Log when built-in tools are enabled
		if (
			agent.builtInTools?.googleSearch ||
			agent.builtInTools?.codeExecution
		) {
			this.logger.log(
				`[EVAL_TOOLS] Agent: ${agent.name} | GoogleSearch: ${!!agent.builtInTools.googleSearch} | CodeExecution: ${!!agent.builtInTools.codeExecution}`,
			);
		}

		const llmStartTime = Date.now();
		const response = await this.aiService.generateText({
			provider: AIProvider.Google,
			model,
			messages,
			temperature: agent.temperature ?? 0.3,
			builtInTools:
				agent.builtInTools?.googleSearch ||
				agent.builtInTools?.codeExecution
					? agent.builtInTools
					: undefined,
		});
		const llmTime = Date.now() - llmStartTime;

		// Parse the evaluation response
		const evaluation = this.parseEvaluationResponse(response.content);
		const totalTime = Date.now() - startTime;

		this.logger.log(
			`[EVAL_COMPLETE] Agent: ${agent.name} | ImageID: ${image.id} | ` +
				`Score: ${evaluation.score} | Weight: ${agent.scoringWeight} | ` +
				`LLMTime: ${llmTime}ms | TotalTime: ${totalTime}ms`,
		);

		if (evaluation.categoryScores) {
			const categoryStr = Object.entries(evaluation.categoryScores)
				.map(([k, v]) => `${k}:${v}`)
				.join(', ');
			this.logger.debug(
				`[EVAL_CATEGORIES] Agent: ${agent.name} | Categories: [${categoryStr}]`,
			);
		}

		// P1 Issue #5: Add null check for feedback before substring
		const feedbackPreview = (evaluation.feedback || '').substring(0, 100);
		this.logger.debug(
			`[EVAL_FEEDBACK] Agent: ${agent.name} | Feedback: "${feedbackPreview}..."`,
		);

		return {
			agentId: agent.id,
			agentName: agent.name,
			imageId: image.id,
			overallScore: evaluation.score,
			categoryScores: evaluation.categoryScores,
			feedback: evaluation.feedback,
			weight: agent.scoringWeight,
			topIssue: evaluation.topIssue,
			topIssues: evaluation.topIssues,
			whatWorked: evaluation.whatWorked,
			checklist: evaluation.checklist,
			promptInstructions: evaluation.promptInstructions,
		};
	}

	/**
	 * Evaluate an image with all judges
	 * @precondition All agents must have canJudge=true (validated at runtime)
	 * @precondition All agents must belong to the same organization (validated at runtime)
	 */
	public async evaluateWithAllJudges(
		agents: Agent[],
		image: GeneratedImage,
		brief: string,
		organizationId: string,
		iterationContext?: IterationContext,
	): Promise<EvaluationResult[]> {
		const startTime = Date.now();
		this.logger.log(
			`[EVAL_ALL_JUDGES_START] ImageID: ${image.id} | JudgeCount: ${agents.length}`,
		);

		// P0 Security: Validate all agents belong to the request's organization
		const invalidAgents = agents.filter(
			(a) => a.organizationId !== organizationId,
		);
		if (invalidAgents.length > 0) {
			const error = `${invalidAgents.length} agent(s) do not belong to organization ${organizationId}`;
			this.logger.error(`[EVAL_SECURITY_ERROR] ${error}`);
			throw new Error(error);
		}

		// Defensive: assert all agents have canJudge enabled (Issue #6)
		const nonJudges = agents.filter((a) => !a.canJudge);
		if (nonJudges.length > 0) {
			const names = nonJudges.map((a) => a.name).join(', ');
			this.logger.error(
				`[EVAL_CANJUDGE_ERROR] Non-judge agents passed to evaluateWithAllJudges: ${names}`,
			);
			throw new Error(
				`Cannot evaluate with non-judge agents (canJudge=false): ${names}`,
			);
		}

		const evaluations = await Promise.all(
			agents.map((agent) =>
				this.evaluateImage(
					agent,
					image,
					brief,
					organizationId,
					iterationContext,
				),
			),
		);

		const totalTime = Date.now() - startTime;
		const avgScore =
			evaluations.reduce((sum, e) => sum + e.overallScore, 0) /
			evaluations.length;

		this.logger.log(
			`[EVAL_ALL_JUDGES_COMPLETE] ImageID: ${image.id} | ` +
				`Evaluations: ${evaluations.length} | ` +
				`AvgScore: ${avgScore.toFixed(2)} | ` +
				`TotalTime: ${totalTime}ms`,
		);

		return evaluations;
	}

	/**
	 * Aggregate evaluations for multiple images and select the best one
	 */
	public aggregateEvaluations(
		evaluationsByImage: Map<string, EvaluationResult[]>,
	): AggregatedEvaluation[] {
		this.logger.debug(
			`[AGGREGATION_START] ImageCount: ${evaluationsByImage.size}`,
		);

		const aggregated: AggregatedEvaluation[] = [];

		for (const [imageId, evaluations] of evaluationsByImage) {
			// Calculate weighted average score
			const totalWeight = evaluations.reduce(
				(sum, e) => sum + e.weight,
				0,
			);
			const weightedSum = evaluations.reduce(
				(sum, e) => sum + e.overallScore * e.weight,
				0,
			);
			const aggregateScore =
				totalWeight > 0 ? weightedSum / totalWeight : 0;

			this.logger.debug(
				`[AGGREGATE_IMAGE] ImageID: ${imageId} | ` +
					`TotalWeight: ${totalWeight} | ` +
					`WeightedSum: ${weightedSum.toFixed(2)} | ` +
					`AggregateScore: ${aggregateScore.toFixed(2)}`,
			);

			aggregated.push({
				imageId,
				aggregateScore,
				evaluations,
			});
		}

		// Sort by aggregate score descending
		const sorted = aggregated.sort(
			(a, b) => b.aggregateScore - a.aggregateScore,
		);

		this.logger.log(
			`[AGGREGATION_COMPLETE] ImageCount: ${sorted.length} | ` +
				`TopScore: ${sorted[0]?.aggregateScore.toFixed(2) ?? 'N/A'} | ` +
				`BottomScore: ${sorted[sorted.length - 1]?.aggregateScore.toFixed(2) ?? 'N/A'}`,
		);

		return sorted;
	}

	/**
	 * Compose the system message for a judge agent by combining
	 * the agent's personality/role prompt with the judge output format.
	 * Uses agent.judgePrompt if set, otherwise falls back to DEFAULT_JUDGE_TEMPLATE.
	 */
	private composeJudgeSystemMessage(agent: Agent): string {
		// Use || so empty-string judgePrompt also falls back to the default template
		const judgeFormat = agent.judgePrompt || DEFAULT_JUDGE_TEMPLATE;

		// P1 Issue #3: Validate judgePrompt contains OUTPUT FORMAT instructions
		// If custom judgePrompt is set but doesn't contain critical sections, append fallback
		if (agent.judgePrompt && !agent.judgePrompt.includes('OUTPUT FORMAT')) {
			this.logger.warn(
				`[EVAL_JUDGE_PROMPT_WARNING] Agent ${agent.name} has custom judgePrompt without OUTPUT FORMAT section - appending default format`,
			);
			return `${agent.systemPrompt}\n\n---\n\n${agent.judgePrompt}\n\n---\n\n${DEFAULT_JUDGE_TEMPLATE}${this.buildToolInstructions(agent)}`;
		}

		return `${agent.systemPrompt}\n\n---\n\n${judgeFormat}${this.buildToolInstructions(agent)}`;
	}

	/**
	 * Build tool usage instructions when built-in tools are enabled
	 */
	private buildToolInstructions(agent: Agent): string {
		if (
			!agent.builtInTools?.googleSearch &&
			!agent.builtInTools?.codeExecution
		) {
			return '';
		}

		const parts = ['\n\n---\n\n## AVAILABLE TOOLS'];

		if (agent.builtInTools.googleSearch) {
			parts.push(
				'\n### Google Search\nUse Google Search to verify brand accuracy, product appearance, and factual claims. Search for the real product to compare against the generated image. Include findings in your feedback.',
			);
		}

		if (agent.builtInTools.codeExecution) {
			parts.push(
				'\n### Code Execution (Python)\nUse Python code execution for objective measurements: color distance (Delta E), aspect ratios, layout proportions, dominant color analysis. Include computation results in your feedback.',
			);
		}

		parts.push(
			'\n\n**IMPORTANT**: Your final response MUST still be the standard JSON evaluation object regardless of tool usage.',
		);
		return parts.join('');
	}

	/**
	 * Build the evaluation prompt
	 */
	private buildEvaluationPrompt(
		agent: Agent,
		brief: string,
		promptUsed: string,
		ragContext: string,
		iterationContext?: IterationContext,
	): string {
		const parts: string[] = [];

		parts.push('## Task: Evaluate this image');
		parts.push('');

		// Add iteration context if available
		if (iterationContext && iterationContext.previousScores.length > 0) {
			parts.push('### Iteration Context');
			parts.push(
				`This is iteration ${iterationContext.currentIteration} of ${iterationContext.maxIterations}. ` +
					`Previous scores: [${iterationContext.previousScores.join(', ')}].`,
			);
			parts.push(
				'Score the image on its absolute merits. If this iteration genuinely improved on previous issues, ' +
					'the score SHOULD increase. If the same problems persist, the score should NOT increase. ' +
					'Do not inflate scores just because this is a later iteration.',
			);
			parts.push('');
		}

		parts.push('### Original Brief');
		parts.push(brief);
		parts.push('');
		parts.push('### Prompt Used for Generation');
		parts.push(promptUsed);
		parts.push('');

		if (ragContext) {
			parts.push(ragContext);
			parts.push('');
		}

		if (agent.evaluationCategories) {
			parts.push('### Evaluation Categories');
			parts.push(agent.evaluationCategories);
			parts.push('');
		}

		return parts.join('\n');
	}

	/**
	 * Parse the evaluation response from the LLM
	 */
	private parseEvaluationResponse(content: string): {
		score: number;
		categoryScores?: Record<string, number>;
		feedback: string;
		topIssue?: TopIssue;
		topIssues?: TopIssue[];
		whatWorked?: string[];
		checklist?: Record<string, { passed: boolean; note?: string }>;
		promptInstructions?: string[];
	} {
		try {
			// Extract JSON from response
			const jsonMatch = content.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				throw new Error('No JSON found in response');
			}

			const parsed = JSON.parse(jsonMatch[0]);

			// Debug: Log what the LLM returned
			this.logger.debug(
				`[PARSE_DEBUG] Keys in response: ${Object.keys(parsed).join(', ')}`,
			);

			// Handle score carefully: use 50 only if score is missing/NaN, not if it's 0
			const parsedScore = Number(parsed.score);
			const score = Number.isNaN(parsedScore) ? 50 : parsedScore;

			// Parse TOP_ISSUES (array) or legacy TOP_ISSUE (single object)
			let topIssues: TopIssue[] = [];
			const rawIssues =
				parsed.TOP_ISSUES || parsed.topIssues || parsed.top_issues;
			const rawIssue =
				parsed.TOP_ISSUE || parsed.topIssue || parsed.top_issue;

			if (Array.isArray(rawIssues) && rawIssues.length > 0) {
				topIssues = rawIssues
					.filter((ti: any) => ti && ti.problem)
					.map((ti: any) => ({
						problem: ti.problem || 'Unknown issue',
						severity: ti.severity || 'moderate',
						fix: ti.fix || 'No fix provided',
					}));
				this.logger.debug(
					`[PARSE_DEBUG] TOP_ISSUES array: ${topIssues.length} issues`,
				);
			} else if (rawIssue && rawIssue.problem) {
				// Legacy single TOP_ISSUE format
				topIssues = [
					{
						problem: rawIssue.problem || 'Unknown issue',
						severity: rawIssue.severity || 'moderate',
						fix: rawIssue.fix || 'No fix provided',
					},
				];
				this.logger.debug(
					`[PARSE_DEBUG] Legacy TOP_ISSUE: ${JSON.stringify(rawIssue)}`,
				);
			} else {
				this.logger.debug(`[PARSE_DEBUG] No TOP_ISSUES in response`);
			}

			// Keep topIssue for backward compat (first item)
			const topIssue = topIssues.length > 0 ? topIssues[0] : undefined;

			// Parse whatWorked if present
			const whatWorked = parsed.whatWorked || parsed.what_worked;

			// Parse checklist if present
			const checklist = parsed.checklist;

			// Parse promptInstructions if present
			const rawPromptInstructions =
				parsed.promptInstructions || parsed.prompt_instructions;
			const promptInstructions = Array.isArray(rawPromptInstructions)
				? (rawPromptInstructions
						.filter(
							(i: unknown) => typeof i === 'string' && i.trim(),
						)
						.map((i: string) => i.trim()) as string[])
				: undefined;

			// Parse categoryScores (handle snake_case variant like other fields)
			const categoryScores =
				parsed.categoryScores || parsed.category_scores;

			return {
				score: Math.min(100, Math.max(0, score)),
				categoryScores,
				feedback: parsed.feedback || 'No feedback provided',
				topIssue,
				topIssues: topIssues.length > 0 ? topIssues : undefined,
				whatWorked: Array.isArray(whatWorked) ? whatWorked : undefined,
				checklist,
				promptInstructions,
			};
		} catch (error) {
			// P1 Issue #4: Replace silent fallback with explicit error handling
			const message =
				error instanceof Error ? error.message : 'Unknown error';
			this.logger.error(
				`[EVAL_PARSE_FAILED] Failed to parse evaluation response: ${message} | ` +
					`Response: ${content?.substring(0, 200)}...`,
			);

			// Throw error instead of silent fallback to surface parsing issues
			throw new Error(
				`Evaluation response parsing failed: ${message}. ` +
					`LLM may not be following OUTPUT FORMAT instructions. ` +
					`Response preview: ${content?.substring(0, 100)}...`,
			);
		}
	}

	/**
	 * Convert evaluation results to snapshot format
	 */
	public toSnapshots(
		evaluations: EvaluationResult[],
	): AgentEvaluationSnapshot[] {
		return evaluations.map((e) => ({
			agentId: e.agentId,
			agentName: e.agentName,
			imageId: e.imageId,
			overallScore: e.overallScore,
			categoryScores: e.categoryScores,
			feedback: e.feedback,
			weight: e.weight,
			topIssue: e.topIssue,
			topIssues: e.topIssues,
			whatWorked: e.whatWorked,
			checklist: e.checklist,
			promptInstructions: e.promptInstructions,
		}));
	}

	/**
	 * P2 Issue #7: Map agent's modelTier to actual Gemini model name
	 */
	private getModelFromTier(modelTier?: string): string {
		switch (modelTier) {
			case 'PRO':
				return 'gemini-2.0-pro';
			case 'FLASH':
				return 'gemini-2.0-flash';
			default:
				// Default to flash for performance/cost balance
				return 'gemini-2.0-flash';
		}
	}
}
