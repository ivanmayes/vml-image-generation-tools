/**
 * Pure-logic unit tests for EvaluationService.
 *
 * Strategy: The service's core logic lives in private methods. To test them
 * without mocks we instantiate the class with null deps (the pure methods
 * never touch the injected services) and access them via (service as any).
 */
import { DEFAULT_JUDGE_TEMPLATE } from '../prompts/default-judge-template';

import { EvaluationService, EvaluationResult } from './evaluation.service';

function createService(): EvaluationService {
	// Pass null for DI deps — pure methods never call them
	return new EvaluationService(null as any, null as any);
}

describe('EvaluationService — pure logic', () => {
	let service: EvaluationService;

	beforeEach(() => {
		service = createService();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// parseEvaluationResponse()
	// ═══════════════════════════════════════════════════════════════════════════

	describe('parseEvaluationResponse()', () => {
		const parse = (content: string) =>
			(service as any).parseEvaluationResponse(content);

		it('should parse a well-formed JSON response', () => {
			const json = JSON.stringify({
				score: 85,
				feedback: 'Great image quality',
				categoryScores: { composition: 90, lighting: 80 },
				TOP_ISSUE: {
					problem: 'Label slightly blurred',
					severity: 'minor',
					fix: 'Sharpen label text',
				},
				whatWorked: ['Good lighting', 'Correct product placement'],
				checklist: {
					brand_accuracy: { passed: true, note: 'Logo is correct' },
				},
				promptInstructions: ['Add rim lighting at 5600K'],
			});

			const result = parse(json);
			expect(result.score).toBe(85);
			expect(result.feedback).toBe('Great image quality');
			expect(result.categoryScores).toEqual({
				composition: 90,
				lighting: 80,
			});
			expect(result.topIssue).toEqual({
				problem: 'Label slightly blurred',
				severity: 'minor',
				fix: 'Sharpen label text',
			});
			expect(result.whatWorked).toEqual([
				'Good lighting',
				'Correct product placement',
			]);
			expect(result.checklist).toEqual({
				brand_accuracy: { passed: true, note: 'Logo is correct' },
			});
			expect(result.promptInstructions).toEqual([
				'Add rim lighting at 5600K',
			]);
		});

		it('should extract JSON embedded in surrounding text', () => {
			const content =
				'Here is my evaluation:\n' +
				JSON.stringify({ score: 72, feedback: 'Decent' }) +
				'\nEnd of evaluation.';
			const result = parse(content);
			expect(result.score).toBe(72);
			expect(result.feedback).toBe('Decent');
		});

		it('should clamp score to 0-100 range', () => {
			const over = parse(JSON.stringify({ score: 150, feedback: 'ok' }));
			expect(over.score).toBe(100);

			const under = parse(JSON.stringify({ score: -10, feedback: 'ok' }));
			expect(under.score).toBe(0);
		});

		it('should allow score of 0', () => {
			const result = parse(
				JSON.stringify({ score: 0, feedback: 'terrible' }),
			);
			expect(result.score).toBe(0);
		});

		it('should default score to 50 when missing or NaN', () => {
			const noScore = parse(JSON.stringify({ feedback: 'no score' }));
			expect(noScore.score).toBe(50);

			const nanScore = parse(
				JSON.stringify({ score: 'not a number', feedback: 'bad' }),
			);
			expect(nanScore.score).toBe(50);
		});

		it('should default feedback to "No feedback provided" when missing', () => {
			const result = parse(JSON.stringify({ score: 50 }));
			expect(result.feedback).toBe('No feedback provided');
		});

		it('should handle snake_case variants of fields', () => {
			const json = JSON.stringify({
				score: 80,
				feedback: 'ok',
				category_scores: { color: 90 },
				topIssue: {
					problem: 'Issue',
					severity: 'moderate',
					fix: 'Fix it',
				},
				what_worked: ['Colors'],
				prompt_instructions: ['Use warmer tones'],
			});
			const result = parse(json);
			expect(result.categoryScores).toEqual({ color: 90 });
			expect(result.topIssue?.problem).toBe('Issue');
			expect(result.whatWorked).toEqual(['Colors']);
			expect(result.promptInstructions).toEqual(['Use warmer tones']);
		});

		it('should handle TOP_ISSUE with missing fields by providing defaults', () => {
			const json = JSON.stringify({
				score: 60,
				feedback: 'ok',
				TOP_ISSUE: {},
			});
			const result = parse(json);
			expect(result.topIssue).toEqual({
				problem: 'Unknown issue',
				severity: 'moderate',
				fix: 'No fix provided',
			});
		});

		it('should return undefined topIssue when not present', () => {
			const json = JSON.stringify({ score: 90, feedback: 'ok' });
			const result = parse(json);
			expect(result.topIssue).toBeUndefined();
		});

		it('should filter out empty/whitespace prompt instructions', () => {
			const json = JSON.stringify({
				score: 75,
				feedback: 'ok',
				promptInstructions: [
					'  Valid instruction  ',
					'',
					'   ',
					'Another',
				],
			});
			const result = parse(json);
			expect(result.promptInstructions).toEqual([
				'Valid instruction',
				'Another',
			]);
		});

		it('should return undefined promptInstructions when not an array', () => {
			const json = JSON.stringify({
				score: 75,
				feedback: 'ok',
				promptInstructions: 'not an array',
			});
			const result = parse(json);
			expect(result.promptInstructions).toBeUndefined();
		});

		it('should return undefined whatWorked when not an array', () => {
			const json = JSON.stringify({
				score: 75,
				feedback: 'ok',
				whatWorked: 'just a string',
			});
			const result = parse(json);
			expect(result.whatWorked).toBeUndefined();
		});

		it('should throw on content with no JSON', () => {
			expect(() => parse('No JSON here at all')).toThrow(
				'Evaluation response parsing failed',
			);
		});

		it('should throw on malformed JSON', () => {
			expect(() => parse('{ broken json: }')).toThrow(
				'Evaluation response parsing failed',
			);
		});

		it('should throw on empty string', () => {
			expect(() => parse('')).toThrow(
				'Evaluation response parsing failed',
			);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// composeJudgeSystemMessage()
	// ═══════════════════════════════════════════════════════════════════════════

	describe('composeJudgeSystemMessage()', () => {
		const compose = (agent: any) =>
			(service as any).composeJudgeSystemMessage(agent);

		it('should use DEFAULT_JUDGE_TEMPLATE when no custom judgePrompt', () => {
			const agent = {
				systemPrompt: 'You are a brand expert.',
				judgePrompt: null,
			};
			const result = compose(agent);
			expect(result).toBe(
				`You are a brand expert.\n\n---\n\n${DEFAULT_JUDGE_TEMPLATE}`,
			);
		});

		it('should use DEFAULT_JUDGE_TEMPLATE when judgePrompt is empty string', () => {
			const agent = {
				systemPrompt: 'You are a brand expert.',
				judgePrompt: '',
			};
			const result = compose(agent);
			expect(result).toContain(DEFAULT_JUDGE_TEMPLATE);
		});

		it('should use custom judgePrompt that contains OUTPUT FORMAT', () => {
			const customPrompt =
				'Custom judge prompt\n\n## OUTPUT FORMAT\n\n{json here}';
			const agent = {
				systemPrompt: 'You are a brand expert.',
				judgePrompt: customPrompt,
			};
			const result = compose(agent);
			expect(result).toBe(
				`You are a brand expert.\n\n---\n\n${customPrompt}`,
			);
			// Should NOT append the default template
			expect(result).not.toContain(DEFAULT_JUDGE_TEMPLATE);
		});

		it('should append DEFAULT_JUDGE_TEMPLATE when custom judgePrompt lacks OUTPUT FORMAT', () => {
			const customPrompt = 'Custom judge without output format section';
			const agent = {
				systemPrompt: 'You are a brand expert.',
				judgePrompt: customPrompt,
			};
			const result = compose(agent);
			// Should contain all three parts
			expect(result).toContain('You are a brand expert.');
			expect(result).toContain(customPrompt);
			expect(result).toContain(DEFAULT_JUDGE_TEMPLATE);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// buildEvaluationPrompt()
	// ═══════════════════════════════════════════════════════════════════════════

	describe('buildEvaluationPrompt()', () => {
		const build = (
			agent: any,
			brief: string,
			promptUsed: string,
			ragContext: string,
			iterationContext?: any,
		) =>
			(service as any).buildEvaluationPrompt(
				agent,
				brief,
				promptUsed,
				ragContext,
				iterationContext,
			);

		it('should include brief and prompt in output', () => {
			const result = build(
				{ evaluationCategories: null },
				'Create a product photo',
				'High quality product photo with lighting',
				'',
			);
			expect(result).toContain('## Task: Evaluate this image');
			expect(result).toContain('### Original Brief');
			expect(result).toContain('Create a product photo');
			expect(result).toContain('### Prompt Used for Generation');
			expect(result).toContain(
				'High quality product photo with lighting',
			);
		});

		it('should include iteration context when provided', () => {
			const result = build(
				{ evaluationCategories: null },
				'brief',
				'prompt',
				'',
				{
					currentIteration: 3,
					maxIterations: 10,
					previousScores: [60, 65, 70],
				},
			);
			expect(result).toContain('### Iteration Context');
			expect(result).toContain('iteration 3 of 10');
			expect(result).toContain('60, 65, 70');
		});

		it('should skip iteration context when previousScores is empty', () => {
			const result = build(
				{ evaluationCategories: null },
				'brief',
				'prompt',
				'',
				{
					currentIteration: 1,
					maxIterations: 10,
					previousScores: [],
				},
			);
			expect(result).not.toContain('### Iteration Context');
		});

		it('should include RAG context when provided', () => {
			const result = build(
				{ evaluationCategories: null },
				'brief',
				'prompt',
				'\n\nReference Guidelines:\nBrand must use blue color.',
			);
			expect(result).toContain('Reference Guidelines');
			expect(result).toContain('Brand must use blue color.');
		});

		it('should include evaluation categories when agent has them', () => {
			const result = build(
				{ evaluationCategories: 'brand,quality,composition' },
				'brief',
				'prompt',
				'',
			);
			expect(result).toContain('### Evaluation Categories');
			expect(result).toContain('brand,quality,composition');
		});

		it('should skip evaluation categories when null', () => {
			const result = build(
				{ evaluationCategories: null },
				'brief',
				'prompt',
				'',
			);
			expect(result).not.toContain('### Evaluation Categories');
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// aggregateEvaluations()
	// ═══════════════════════════════════════════════════════════════════════════

	describe('aggregateEvaluations()', () => {
		it('should calculate weighted average scores', () => {
			const evaluations = new Map<string, EvaluationResult[]>();
			evaluations.set('img-1', [
				{
					agentId: 'a1',
					agentName: 'Judge A',
					imageId: 'img-1',
					overallScore: 80,
					feedback: 'Good',
					weight: 2,
				},
				{
					agentId: 'a2',
					agentName: 'Judge B',
					imageId: 'img-1',
					overallScore: 60,
					feedback: 'Ok',
					weight: 1,
				},
			]);

			const result = service.aggregateEvaluations(evaluations);
			expect(result).toHaveLength(1);
			// Weighted average: (80*2 + 60*1) / (2+1) = 220/3 ≈ 73.33
			expect(result[0].aggregateScore).toBeCloseTo(73.33, 1);
		});

		it('should sort images by aggregate score descending', () => {
			const evaluations = new Map<string, EvaluationResult[]>();
			evaluations.set('img-low', [
				{
					agentId: 'a1',
					agentName: 'Judge',
					imageId: 'img-low',
					overallScore: 40,
					feedback: 'Poor',
					weight: 1,
				},
			]);
			evaluations.set('img-high', [
				{
					agentId: 'a1',
					agentName: 'Judge',
					imageId: 'img-high',
					overallScore: 90,
					feedback: 'Excellent',
					weight: 1,
				},
			]);
			evaluations.set('img-mid', [
				{
					agentId: 'a1',
					agentName: 'Judge',
					imageId: 'img-mid',
					overallScore: 70,
					feedback: 'Good',
					weight: 1,
				},
			]);

			const result = service.aggregateEvaluations(evaluations);
			expect(result[0].imageId).toBe('img-high');
			expect(result[1].imageId).toBe('img-mid');
			expect(result[2].imageId).toBe('img-low');
		});

		it('should return 0 for aggregate score when total weight is 0', () => {
			const evaluations = new Map<string, EvaluationResult[]>();
			evaluations.set('img-1', [
				{
					agentId: 'a1',
					agentName: 'Judge',
					imageId: 'img-1',
					overallScore: 80,
					feedback: 'Good',
					weight: 0,
				},
			]);

			const result = service.aggregateEvaluations(evaluations);
			expect(result[0].aggregateScore).toBe(0);
		});

		it('should handle empty evaluations map', () => {
			const evaluations = new Map<string, EvaluationResult[]>();
			const result = service.aggregateEvaluations(evaluations);
			expect(result).toHaveLength(0);
		});

		it('should handle single image with single evaluation', () => {
			const evaluations = new Map<string, EvaluationResult[]>();
			evaluations.set('img-1', [
				{
					agentId: 'a1',
					agentName: 'Judge',
					imageId: 'img-1',
					overallScore: 75,
					feedback: 'Good',
					weight: 1,
				},
			]);

			const result = service.aggregateEvaluations(evaluations);
			expect(result[0].aggregateScore).toBe(75);
		});

		it('should preserve all evaluation data in the aggregation', () => {
			const evaluations = new Map<string, EvaluationResult[]>();
			const eval1: EvaluationResult = {
				agentId: 'a1',
				agentName: 'Judge A',
				imageId: 'img-1',
				overallScore: 85,
				feedback: 'Very good',
				weight: 1,
				topIssue: {
					problem: 'Minor blur',
					severity: 'minor',
					fix: 'Sharpen',
				},
				whatWorked: ['Lighting'],
			};
			evaluations.set('img-1', [eval1]);

			const result = service.aggregateEvaluations(evaluations);
			expect(result[0].evaluations[0]).toEqual(eval1);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// toSnapshots()
	// ═══════════════════════════════════════════════════════════════════════════

	describe('toSnapshots()', () => {
		it('should convert evaluations to snapshot format', () => {
			const evaluations: EvaluationResult[] = [
				{
					agentId: 'a1',
					agentName: 'Judge A',
					imageId: 'img-1',
					overallScore: 85,
					categoryScores: { quality: 90 },
					feedback: 'Good job',
					weight: 2,
					topIssue: {
						problem: 'Test',
						severity: 'minor',
						fix: 'Fix it',
					},
					whatWorked: ['Lighting'],
					checklist: {
						brand: { passed: true },
					},
					promptInstructions: ['Add more detail'],
				},
			];

			const snapshots = service.toSnapshots(evaluations);
			expect(snapshots).toHaveLength(1);
			expect(snapshots[0].agentId).toBe('a1');
			expect(snapshots[0].overallScore).toBe(85);
			expect(snapshots[0].categoryScores).toEqual({ quality: 90 });
			expect(snapshots[0].topIssue?.problem).toBe('Test');
			expect(snapshots[0].whatWorked).toEqual(['Lighting']);
			expect(snapshots[0].promptInstructions).toEqual([
				'Add more detail',
			]);
		});

		it('should handle empty evaluations array', () => {
			const snapshots = service.toSnapshots([]);
			expect(snapshots).toHaveLength(0);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// getModelFromTier()
	// ═══════════════════════════════════════════════════════════════════════════

	describe('getModelFromTier()', () => {
		const getModel = (tier?: string) =>
			(service as any).getModelFromTier(tier);

		it('should return gemini-2.0-pro for PRO tier', () => {
			expect(getModel('PRO')).toBe('gemini-2.0-pro');
		});

		it('should return gemini-2.0-flash for FLASH tier', () => {
			expect(getModel('FLASH')).toBe('gemini-2.0-flash');
		});

		it('should default to gemini-2.0-flash for undefined tier', () => {
			expect(getModel(undefined)).toBe('gemini-2.0-flash');
		});

		it('should default to gemini-2.0-flash for unknown tier string', () => {
			expect(getModel('UNKNOWN')).toBe('gemini-2.0-flash');
		});

		it('should default to gemini-2.0-flash for null', () => {
			expect(getModel(null as any)).toBe('gemini-2.0-flash');
		});
	});
});
