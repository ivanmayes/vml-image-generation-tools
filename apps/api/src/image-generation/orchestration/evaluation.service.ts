import { Injectable, Logger } from '@nestjs/common';

import { AIService } from '../../ai/ai.service';
import {
	AIMessageRole,
	AIMessage,
	AIProvider,
} from '../../_core/third-party/ai';
import { Agent, AgentEvaluationSnapshot, GeneratedImage } from '../entities';
import { DocumentProcessorService } from '../document-processor/document-processor.service';

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
	topIssue?: TopIssue;
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
		iterationContext?: IterationContext,
	): Promise<EvaluationResult> {
		const startTime = Date.now();
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
			{ role: AIMessageRole.System, content: agent.systemPrompt },
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

		const llmStartTime = Date.now();
		const response = await this.aiService.generateText({
			provider: AIProvider.Google,
			model: 'gemini-2.0-flash',
			messages,
			temperature: 0.3,
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

		this.logger.debug(
			`[EVAL_FEEDBACK] Agent: ${agent.name} | Feedback: "${evaluation.feedback.substring(0, 100)}..."`,
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
			whatWorked: evaluation.whatWorked,
			checklist: evaluation.checklist,
			promptInstructions: evaluation.promptInstructions,
		};
	}

	/**
	 * Evaluate an image with all judges
	 */
	public async evaluateWithAllJudges(
		agents: Agent[],
		image: GeneratedImage,
		brief: string,
		iterationContext?: IterationContext,
	): Promise<EvaluationResult[]> {
		const startTime = Date.now();
		this.logger.log(
			`[EVAL_ALL_JUDGES_START] ImageID: ${image.id} | JudgeCount: ${agents.length}`,
		);

		const evaluations = await Promise.all(
			agents.map((agent) =>
				this.evaluateImage(agent, image, brief, iterationContext),
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

		// Note: Response format is defined in the agent's system prompt
		// which may include TOP_ISSUE, checklist, whatWorked etc.
		// Only add a basic reminder here if the agent doesn't specify a format
		if (!agent.systemPrompt?.includes('OUTPUT FORMAT')) {
			parts.push('### Response Format');
			parts.push('Provide your evaluation in the following JSON format:');
			parts.push('```json');
			parts.push('{');
			parts.push('  "score": <number 0-100>,');
			parts.push('  "TOP_ISSUE": {');
			parts.push('    "problem": "<single most important issue>",');
			parts.push('    "severity": "critical|major|moderate|minor",');
			parts.push('    "fix": "<specific fix instruction>"');
			parts.push('  },');
			parts.push(
				'  "categoryScores": { "<category>": <number 0-100>, ... },',
			);
			parts.push('  "whatWorked": ["<positive aspect>", ...],');
			parts.push(
				'  "promptInstructions": ["<exact text snippet or instruction to include in next prompt>", ...],',
			);
			parts.push('  "feedback": "<detailed feedback for improvement>"');
			parts.push('}');
			parts.push('```');
			parts.push('');
			parts.push(
				'The `promptInstructions` field should contain exact text snippets or specific instructions ' +
					'that should appear verbatim in the next generation prompt. For example: ' +
					'"Add rim lighting at 5600K from behind the subject" or "The bottle label must read RESERVE 18 in gold serif font".',
			);
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
			if (parsed.TOP_ISSUE || parsed.topIssue) {
				this.logger.debug(
					`[PARSE_DEBUG] TOP_ISSUE found: ${JSON.stringify(parsed.TOP_ISSUE || parsed.topIssue)}`,
				);
			} else {
				this.logger.debug(`[PARSE_DEBUG] No TOP_ISSUE in response`);
			}

			// Handle score carefully: use 50 only if score is missing/NaN, not if it's 0
			const parsedScore = Number(parsed.score);
			const score = Number.isNaN(parsedScore) ? 50 : parsedScore;

			// Parse TOP_ISSUE if present
			let topIssue: TopIssue | undefined;
			if (parsed.TOP_ISSUE || parsed.topIssue) {
				const ti = parsed.TOP_ISSUE || parsed.topIssue;
				topIssue = {
					problem: ti.problem || 'Unknown issue',
					severity: ti.severity || 'moderate',
					fix: ti.fix || 'No fix provided',
				};
			}

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

			return {
				score: Math.min(100, Math.max(0, score)),
				categoryScores: parsed.categoryScores,
				feedback: parsed.feedback || 'No feedback provided',
				topIssue,
				whatWorked: Array.isArray(whatWorked) ? whatWorked : undefined,
				checklist,
				promptInstructions,
			};
		} catch (error) {
			this.logger.warn(`Failed to parse evaluation response: ${content}`);

			// Return default values if parsing fails
			return {
				score: 50,
				feedback: content || 'Evaluation parsing failed',
			};
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
			whatWorked: e.whatWorked,
			checklist: e.checklist,
			promptInstructions: e.promptInstructions,
		}));
	}
}
