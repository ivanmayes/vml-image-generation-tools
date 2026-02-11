import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ArrayContains } from 'typeorm';

import { GoogleClient } from '../_core/third-party/ai/providers/google/google.client';
import { AIModel, AIMessageRole } from '../_core/third-party/ai/models/enums';
import {
	GenerationRequest,
	GenerationRequestStatus,
	AgentEvaluationSnapshot,
	TopIssueSnapshot,
} from '../image-generation/entities/generation-request.entity';
import { DEFAULT_JUDGE_TEMPLATE } from '../image-generation/prompts/default-judge-template';

import { Agent } from './agent.entity';

// ───── Response Interfaces ─────

export interface ChecklistPassRate {
	criteria: string;
	passRate: number;
	timesEvaluated: number;
	flag: 'never_passes' | 'always_passes' | null;
}

export interface CategoryScoreAverage {
	category: string;
	avg: number;
	min: number;
	max: number;
	stdDev: number;
}

export interface ScoreDistributionBucket {
	bucket: string;
	count: number;
	percentage: number;
}

export interface SeverityBreakdown {
	severity: 'critical' | 'major' | 'moderate' | 'minor';
	count: number;
	percentage: number;
}

export interface JudgeAnalyticsResult {
	agentId: string;
	agentName: string;
	requestsAnalyzed: number;
	dateRange: { from: string; to: string };
	avgOverallScore: number;
	checklistPassRates: ChecklistPassRate[];
	categoryScoreAverages: CategoryScoreAverage[];
	scoreDistribution: ScoreDistributionBucket[];
	severityBreakdown: SeverityBreakdown[];
}

export interface QualitativeAnalysisResult {
	recurringThemes: string[];
	blindSpots: string[];
	feedbackQuality: string;
	strengthsRecognized: string[];
	summary: string;
}

export interface PromptOptimizationResult {
	currentPrompt: string;
	suggestedPrompt: string;
	changes: string[];
	isUsingDefaultTemplate: boolean;
}

// ───── Service ─────

@Injectable()
export class AgentAnalyticsService {
	private readonly logger = new Logger(AgentAnalyticsService.name);

	constructor(
		@InjectRepository(GenerationRequest)
		private readonly generationRequestRepo: Repository<GenerationRequest>,
		@InjectRepository(Agent)
		private readonly agentRepo: Repository<Agent>,
	) {}

	// ───── Public Methods ─────

	async getQuantitativeAnalytics(
		orgId: string,
		agentId: string,
		limit: number,
	): Promise<JudgeAnalyticsResult> {
		const agent = await this.agentRepo.findOne({
			where: { id: agentId, organizationId: orgId },
		});
		if (!agent) {
			throw new Error('Agent not found');
		}

		const evaluations = await this.extractEvaluations(
			orgId,
			agentId,
			limit,
		);

		const requestDates = await this.getRequestDateRange(
			orgId,
			agentId,
			limit,
		);

		return {
			agentId,
			agentName: agent.name,
			requestsAnalyzed: requestDates.count,
			dateRange: requestDates.range,
			avgOverallScore: this.calcAvgScore(evaluations),
			checklistPassRates: this.aggregateChecklist(evaluations),
			categoryScoreAverages: this.aggregateCategories(evaluations),
			scoreDistribution: this.aggregateScoreDistribution(evaluations),
			severityBreakdown: this.aggregateSeverity(evaluations),
		};
	}

	async getQualitativeAnalysis(
		orgId: string,
		agentId: string,
		limit: number,
	): Promise<QualitativeAnalysisResult> {
		const evaluations = await this.extractEvaluations(
			orgId,
			agentId,
			limit,
		);
		const textPayload = this.collectFreeformText(evaluations);

		if (!textPayload.trim()) {
			return {
				recurringThemes: [],
				blindSpots: [],
				feedbackQuality:
					'No evaluation data available for qualitative analysis.',
				strengthsRecognized: [],
				summary: 'No data to analyze.',
			};
		}

		const systemPrompt = `You are an analytics expert analyzing judge evaluation feedback from an AI image generation system.
Given a collection of evaluation feedback text from a single judge across multiple generation requests, provide a structured analysis.

Respond ONLY with valid JSON matching this schema:
{
  "recurringThemes": ["theme1", "theme2", ...],
  "blindSpots": ["blind spot1", ...],
  "feedbackQuality": "assessment string",
  "strengthsRecognized": ["strength1", ...],
  "summary": "overall narrative"
}

Guidelines:
- recurringThemes: The 3-5 most common issue patterns this judge raises repeatedly
- blindSpots: Things a good judge should evaluate but this judge never mentions
- feedbackQuality: Assess whether the judge's fixes are specific and actionable, or vague and unhelpful
- strengthsRecognized: What positive aspects does this judge consistently praise
- summary: A 2-3 sentence overall narrative about this judge's effectiveness`;

		try {
			const response = await GoogleClient.generateText({
				model: AIModel.Gemini15Flash,
				messages: [
					{ role: AIMessageRole.System, content: systemPrompt },
					{
						role: AIMessageRole.User,
						content: `Analyze the following judge evaluation feedback:\n\n${textPayload}`,
					},
				],
				temperature: 0.3,
				maxTokens: 2000,
				responseFormat: { type: 'json_object' },
			});

			const parsed = JSON.parse(response.content);
			return {
				recurringThemes: parsed.recurringThemes ?? [],
				blindSpots: parsed.blindSpots ?? [],
				feedbackQuality: parsed.feedbackQuality ?? '',
				strengthsRecognized: parsed.strengthsRecognized ?? [],
				summary: parsed.summary ?? '',
			};
		} catch (error) {
			this.logger.error('Qualitative analysis LLM call failed', error);
			return {
				recurringThemes: [],
				blindSpots: [],
				feedbackQuality: 'Analysis failed. Please try again.',
				strengthsRecognized: [],
				summary: 'LLM analysis could not be completed.',
			};
		}
	}

	async optimizePrompt(
		orgId: string,
		agentId: string,
		limit: number,
	): Promise<PromptOptimizationResult> {
		const agent = await this.agentRepo.findOne({
			where: { id: agentId, organizationId: orgId },
		});
		if (!agent) {
			throw new Error('Agent not found');
		}

		const isUsingDefaultTemplate = !agent.judgePrompt;
		const currentPrompt = agent.judgePrompt || DEFAULT_JUDGE_TEMPLATE;
		const analytics = await this.getQuantitativeAnalytics(
			orgId,
			agentId,
			limit,
		);

		const analyticsContext = this.formatAnalyticsForLLM(analytics);

		const systemPrompt = `You are a prompt engineering expert. Your task is to improve a judge evaluation prompt based on real performance analytics.

Given the current judge prompt and analytics showing how each criterion actually performs, produce an improved prompt.

Rules:
- Remove or reword checklist criteria with <10% pass rate (they ask for things AI cannot reliably do)
- Remove or reword checklist criteria with >90% pass rate (they don't discriminate between good and bad)
- Sharpen scoring rubric if scores cluster too tightly in one range
- Preserve the OUTPUT FORMAT section unchanged — it must still produce the required JSON structure
- Keep the prompt's overall voice and domain expertise
- Do not add hallucinated criteria — only modify what exists or add criteria that address identified blind spots

Respond ONLY with valid JSON matching this schema:
{
  "suggestedPrompt": "the full revised prompt text",
  "changes": ["change description 1", "change description 2", ...]
}`;

		try {
			const response = await GoogleClient.generateText({
				model: AIModel.Gemini15Flash,
				messages: [
					{ role: AIMessageRole.System, content: systemPrompt },
					{
						role: AIMessageRole.User,
						content: `CURRENT PROMPT:\n${currentPrompt}\n\nANALYTICS:\n${analyticsContext}`,
					},
				],
				temperature: 0.4,
				maxTokens: 4000,
				responseFormat: { type: 'json_object' },
			});

			const parsed = JSON.parse(response.content);
			return {
				currentPrompt,
				suggestedPrompt: parsed.suggestedPrompt ?? currentPrompt,
				changes: parsed.changes ?? [],
				isUsingDefaultTemplate,
			};
		} catch (error) {
			this.logger.error('Prompt optimization LLM call failed', error);
			return {
				currentPrompt,
				suggestedPrompt: currentPrompt,
				changes: ['Optimization failed. Please try again.'],
				isUsingDefaultTemplate,
			};
		}
	}

	// ───── Private: Data Extraction ─────

	private async extractEvaluations(
		orgId: string,
		agentId: string,
		limit: number,
	): Promise<AgentEvaluationSnapshot[]> {
		const requests = await this.generationRequestRepo.find({
			where: {
				organizationId: orgId,
				status: GenerationRequestStatus.COMPLETED,
				judgeIds: ArrayContains([agentId]),
			},
			order: { createdAt: 'DESC' },
			take: limit,
			select: ['id', 'iterations'],
		});

		const evaluations: AgentEvaluationSnapshot[] = [];
		for (const req of requests) {
			if (!req.iterations) continue;
			for (const iteration of req.iterations) {
				if (!iteration.evaluations) continue;
				for (const evaluation of iteration.evaluations) {
					if (evaluation.agentId === agentId) {
						evaluations.push(evaluation);
					}
				}
			}
		}

		return evaluations;
	}

	private async getRequestDateRange(
		orgId: string,
		agentId: string,
		limit: number,
	): Promise<{ count: number; range: { from: string; to: string } }> {
		const requests = await this.generationRequestRepo.find({
			where: {
				organizationId: orgId,
				status: GenerationRequestStatus.COMPLETED,
				judgeIds: ArrayContains([agentId]),
			},
			order: { createdAt: 'DESC' },
			take: limit,
			select: ['id', 'createdAt'],
		});

		if (requests.length === 0) {
			const now = new Date().toISOString();
			return { count: 0, range: { from: now, to: now } };
		}

		const dates = requests.map((r) => new Date(r.createdAt).getTime());
		return {
			count: requests.length,
			range: {
				from: new Date(Math.min(...dates)).toISOString(),
				to: new Date(Math.max(...dates)).toISOString(),
			},
		};
	}

	// ───── Private: Aggregation ─────

	private normalizeKey(key: string): string {
		return key.toLowerCase().replace(/[\s-]+/g, '_');
	}

	private calcAvgScore(evaluations: AgentEvaluationSnapshot[]): number {
		if (evaluations.length === 0) return 0;
		const sum = evaluations.reduce((s, e) => s + e.overallScore, 0);
		return Math.round((sum / evaluations.length) * 10) / 10;
	}

	private aggregateChecklist(
		evaluations: AgentEvaluationSnapshot[],
	): ChecklistPassRate[] {
		const map = new Map<
			string,
			{ displayName: string; passes: number; total: number }
		>();
		const nameFrequency = new Map<string, Map<string, number>>();

		for (const evaluation of evaluations) {
			if (!evaluation.checklist) continue;
			for (const [key, value] of Object.entries(evaluation.checklist)) {
				const normalized = this.normalizeKey(key);

				// Track display name frequency
				if (!nameFrequency.has(normalized)) {
					nameFrequency.set(normalized, new Map());
				}
				const freq = nameFrequency.get(normalized)!;
				freq.set(key, (freq.get(key) ?? 0) + 1);

				// Aggregate pass/fail
				const existing = map.get(normalized) ?? {
					displayName: key,
					passes: 0,
					total: 0,
				};
				existing.total++;
				if (value.passed) existing.passes++;
				map.set(normalized, existing);
			}
		}

		// Use most common display name variant
		for (const [normalized, entry] of map.entries()) {
			const freq = nameFrequency.get(normalized);
			if (freq) {
				let bestName = entry.displayName;
				let bestCount = 0;
				for (const [name, count] of freq.entries()) {
					if (count > bestCount) {
						bestName = name;
						bestCount = count;
					}
				}
				entry.displayName = bestName;
			}
		}

		return Array.from(map.entries())
			.map(([, entry]) => {
				const passRate =
					entry.total > 0
						? Math.round((entry.passes / entry.total) * 1000) / 10
						: 0;
				return {
					criteria: entry.displayName,
					passRate,
					timesEvaluated: entry.total,
					flag:
						passRate < 10
							? ('never_passes' as const)
							: passRate > 90
								? ('always_passes' as const)
								: null,
				};
			})
			.sort((a, b) => a.passRate - b.passRate);
	}

	private aggregateCategories(
		evaluations: AgentEvaluationSnapshot[],
	): CategoryScoreAverage[] {
		const map = new Map<
			string,
			{ displayName: string; scores: number[] }
		>();
		const nameFrequency = new Map<string, Map<string, number>>();

		for (const evaluation of evaluations) {
			if (!evaluation.categoryScores) continue;
			for (const [key, score] of Object.entries(
				evaluation.categoryScores,
			)) {
				const normalized = this.normalizeKey(key);

				if (!nameFrequency.has(normalized)) {
					nameFrequency.set(normalized, new Map());
				}
				const freq = nameFrequency.get(normalized)!;
				freq.set(key, (freq.get(key) ?? 0) + 1);

				const existing = map.get(normalized) ?? {
					displayName: key,
					scores: [],
				};
				existing.scores.push(score);
				map.set(normalized, existing);
			}
		}

		// Use most common display name
		for (const [normalized, entry] of map.entries()) {
			const freq = nameFrequency.get(normalized);
			if (freq) {
				let bestName = entry.displayName;
				let bestCount = 0;
				for (const [name, count] of freq.entries()) {
					if (count > bestCount) {
						bestName = name;
						bestCount = count;
					}
				}
				entry.displayName = bestName;
			}
		}

		return Array.from(map.entries()).map(([, entry]) => {
			const scores = entry.scores;
			const avg =
				Math.round(
					(scores.reduce((s, v) => s + v, 0) / scores.length) * 10,
				) / 10;
			const min = Math.min(...scores);
			const max = Math.max(...scores);
			const variance =
				scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length;
			const stdDev = Math.round(Math.sqrt(variance) * 10) / 10;

			return {
				category: entry.displayName,
				avg,
				min,
				max,
				stdDev,
			};
		});
	}

	private aggregateScoreDistribution(
		evaluations: AgentEvaluationSnapshot[],
	): ScoreDistributionBucket[] {
		const buckets: { label: string; min: number; max: number }[] = [
			{ label: '0-29', min: 0, max: 29 },
			{ label: '30-49', min: 30, max: 49 },
			{ label: '50-69', min: 50, max: 69 },
			{ label: '70-79', min: 70, max: 79 },
			{ label: '80-89', min: 80, max: 89 },
			{ label: '90-100', min: 90, max: 100 },
		];

		const counts = new Array(buckets.length).fill(0);
		for (const evaluation of evaluations) {
			const score = Math.round(evaluation.overallScore);
			for (let i = 0; i < buckets.length; i++) {
				if (score >= buckets[i].min && score <= buckets[i].max) {
					counts[i]++;
					break;
				}
			}
		}

		const total = evaluations.length || 1;
		return buckets.map((bucket, i) => ({
			bucket: bucket.label,
			count: counts[i],
			percentage: Math.round((counts[i] / total) * 1000) / 10,
		}));
	}

	private aggregateSeverity(
		evaluations: AgentEvaluationSnapshot[],
	): SeverityBreakdown[] {
		const counts: Record<string, number> = {
			critical: 0,
			major: 0,
			moderate: 0,
			minor: 0,
		};

		for (const evaluation of evaluations) {
			const issues = this.coalesceTopIssues(evaluation);
			for (const issue of issues) {
				if (issue.severity in counts) {
					counts[issue.severity]++;
				}
			}
		}

		const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
		return (['critical', 'major', 'moderate', 'minor'] as const).map(
			(severity) => ({
				severity,
				count: counts[severity],
				percentage: Math.round((counts[severity] / total) * 1000) / 10,
			}),
		);
	}

	private coalesceTopIssues(
		evaluation: AgentEvaluationSnapshot,
	): TopIssueSnapshot[] {
		const issues: TopIssueSnapshot[] = [];
		if (evaluation.topIssues?.length) {
			issues.push(...evaluation.topIssues);
		} else if (evaluation.topIssue) {
			issues.push(evaluation.topIssue);
		}
		return issues;
	}

	// ───── Private: Text Collection for Qualitative ─────

	private collectFreeformText(
		evaluations: AgentEvaluationSnapshot[],
	): string {
		const MAX_PAYLOAD = 100_000;
		const parts: string[] = [];
		let totalLength = 0;

		for (const evaluation of evaluations) {
			if (totalLength >= MAX_PAYLOAD) break;

			// Top issues
			const issues = this.coalesceTopIssues(evaluation);
			for (const issue of issues) {
				const text = `ISSUE [${issue.severity}]: ${issue.problem} → FIX: ${issue.fix}`;
				parts.push(text.slice(0, 500));
				totalLength += Math.min(text.length, 500);
			}

			// Feedback
			if (evaluation.feedback) {
				const fb = evaluation.feedback.slice(0, 500);
				parts.push(`FEEDBACK: ${fb}`);
				totalLength += fb.length;
			}

			// What worked
			if (evaluation.whatWorked?.length) {
				const ww = evaluation.whatWorked.join('; ').slice(0, 300);
				parts.push(`STRENGTHS: ${ww}`);
				totalLength += ww.length;
			}

			// Checklist notes
			if (evaluation.checklist) {
				for (const [key, val] of Object.entries(evaluation.checklist)) {
					if (val.note) {
						const note = `CHECKLIST [${key}]: ${val.passed ? 'PASS' : 'FAIL'} — ${val.note.slice(0, 100)}`;
						parts.push(note);
						totalLength += note.length;
					}
				}
			}
		}

		return parts.join('\n');
	}

	// ───── Private: Format Analytics for Optimization ─────

	private formatAnalyticsForLLM(analytics: JudgeAnalyticsResult): string {
		const lines: string[] = [];
		lines.push(`Requests analyzed: ${analytics.requestsAnalyzed}`);
		lines.push(`Average score: ${analytics.avgOverallScore}`);
		lines.push('');

		lines.push('CHECKLIST PASS RATES:');
		for (const c of analytics.checklistPassRates) {
			const flag = c.flag
				? ` ⚠ ${c.flag === 'never_passes' ? 'NEVER PASSES (<10%)' : 'ALWAYS PASSES (>90%)'}`
				: '';
			lines.push(
				`  ${c.criteria}: ${c.passRate}% (${c.timesEvaluated} evals)${flag}`,
			);
		}
		lines.push('');

		lines.push('CATEGORY SCORE AVERAGES:');
		for (const c of analytics.categoryScoreAverages) {
			lines.push(
				`  ${c.category}: avg=${c.avg}, min=${c.min}, max=${c.max}, stdDev=${c.stdDev}`,
			);
		}
		lines.push('');

		lines.push('SCORE DISTRIBUTION:');
		for (const b of analytics.scoreDistribution) {
			lines.push(`  ${b.bucket}: ${b.count} (${b.percentage}%)`);
		}
		lines.push('');

		lines.push('SEVERITY BREAKDOWN:');
		for (const s of analytics.severityBreakdown) {
			lines.push(`  ${s.severity}: ${s.count} (${s.percentage}%)`);
		}

		return lines.join('\n');
	}
}
