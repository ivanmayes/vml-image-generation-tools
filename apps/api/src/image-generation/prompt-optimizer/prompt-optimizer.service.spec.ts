/**
 * Pure-logic unit tests for PromptOptimizerService.
 *
 * Strategy: The pure logic lives in buildOptimizationMessage() (private).
 * We instantiate with null deps and access via (service as any).
 */
import { PromptOptimizerService } from './prompt-optimizer.service';

function createService(): PromptOptimizerService {
	// Pass null for DI deps — the private methods we test never call them
	return new PromptOptimizerService(null as any, null as any, null as any);
}

describe('PromptOptimizerService — pure logic', () => {
	let service: PromptOptimizerService;

	beforeEach(() => {
		service = createService();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// buildOptimizationMessage()
	// ═══════════════════════════════════════════════════════════════════════════

	describe('buildOptimizationMessage()', () => {
		const build = (input: any) =>
			(service as any).buildOptimizationMessage(input);

		it('should include the original brief', () => {
			const result = build({
				originalBrief: 'Create a Coca-Cola ad',
				judgeFeedback: [],
			});
			expect(result).toContain('## Original Brief');
			expect(result).toContain('Create a Coca-Cola ad');
		});

		it('should include current prompt when iterating', () => {
			const result = build({
				originalBrief: 'Brief',
				currentPrompt: 'Current iteration prompt text',
				judgeFeedback: [],
			});
			expect(result).toContain('## Current Prompt');
			expect(result).toContain('Current iteration prompt text');
		});

		it('should not include current prompt section when absent', () => {
			const result = build({
				originalBrief: 'Brief',
				judgeFeedback: [],
			});
			expect(result).not.toContain('## Current Prompt');
		});

		it('should include reference image instructions when hasReferenceImages is true', () => {
			const result = build({
				originalBrief: 'Brief',
				judgeFeedback: [],
				hasReferenceImages: true,
			});
			expect(result).toContain('## Reference Images');
			expect(result).toContain('reference image(s)');
		});

		it('should not include reference image section when false', () => {
			const result = build({
				originalBrief: 'Brief',
				judgeFeedback: [],
				hasReferenceImages: false,
			});
			expect(result).not.toContain('## Reference Images');
		});

		it('should extract and sort TOP_ISSUES by severity then weight', () => {
			const result = build({
				originalBrief: 'Brief',
				judgeFeedback: [
					{
						agentId: 'a1',
						agentName: 'Minor Judge',
						feedback: 'ok',
						score: 80,
						weight: 5,
						topIssue: {
							problem: 'Minor issue',
							severity: 'minor',
							fix: 'Minor fix',
						},
					},
					{
						agentId: 'a2',
						agentName: 'Critical Judge',
						feedback: 'bad',
						score: 40,
						weight: 3,
						topIssue: {
							problem: 'Critical issue',
							severity: 'critical',
							fix: 'Critical fix',
						},
					},
				],
			});
			expect(result).toContain('## CRITICAL ISSUES TO FIX');
			// Critical should appear before minor regardless of weight
			const criticalPos = result.indexOf('Critical issue');
			const minorPos = result.indexOf('Minor issue');
			expect(criticalPos).toBeLessThan(minorPos);
		});

		it('should sort TOP_ISSUES by weight when severities are equal', () => {
			const result = build({
				originalBrief: 'Brief',
				judgeFeedback: [
					{
						agentId: 'a1',
						agentName: 'Low Weight',
						feedback: 'ok',
						score: 60,
						weight: 1,
						topIssue: {
							problem: 'Low weight issue',
							severity: 'major',
							fix: 'Fix 1',
						},
					},
					{
						agentId: 'a2',
						agentName: 'High Weight',
						feedback: 'bad',
						score: 50,
						weight: 10,
						topIssue: {
							problem: 'High weight issue',
							severity: 'major',
							fix: 'Fix 2',
						},
					},
				],
			});
			// High weight should appear first when severity is equal
			const highPos = result.indexOf('High weight issue');
			const lowPos = result.indexOf('Low weight issue');
			expect(highPos).toBeLessThan(lowPos);
		});

		it('should collect and dedupe whatWorked across judges', () => {
			const result = build({
				originalBrief: 'Brief',
				judgeFeedback: [
					{
						agentId: 'a1',
						agentName: 'Judge A',
						feedback: 'ok',
						score: 70,
						weight: 1,
						whatWorked: ['Good lighting', 'Nice colors'],
					},
					{
						agentId: 'a2',
						agentName: 'Judge B',
						feedback: 'ok',
						score: 75,
						weight: 1,
						whatWorked: ['Good lighting', 'Sharp focus'],
					},
				],
			});
			expect(result).toContain('## WHAT WORKED');
			expect(result).toContain('- Good lighting');
			expect(result).toContain('- Nice colors');
			expect(result).toContain('- Sharp focus');
			// "Good lighting" should only appear once in the WHAT WORKED section
			const whatWorkedSection = result
				.split('## WHAT WORKED')[1]
				.split('##')[0];
			const lightingMatches = whatWorkedSection.match(/Good lighting/g);
			expect(lightingMatches).toHaveLength(1);
		});

		it('should include negative prompts when provided', () => {
			const result = build({
				originalBrief: 'Brief',
				judgeFeedback: [],
				negativePrompts: 'No text overlay, no watermarks',
			});
			expect(result).toContain('## Things to Avoid');
			expect(result).toContain('No text overlay, no watermarks');
		});

		it('should include reference context from RAG', () => {
			const result = build({
				originalBrief: 'Brief',
				judgeFeedback: [],
				referenceContext:
					'Brand guidelines state blue is primary color',
			});
			expect(result).toContain('## Reference Guidelines');
			expect(result).toContain(
				'Brand guidelines state blue is primary color',
			);
		});

		it('should sort judge feedback by weight descending', () => {
			const result = build({
				originalBrief: 'Brief',
				judgeFeedback: [
					{
						agentId: 'a1',
						agentName: 'Low Judge',
						feedback: 'Low weight feedback',
						score: 70,
						weight: 1,
					},
					{
						agentId: 'a2',
						agentName: 'High Judge',
						feedback: 'High weight feedback',
						score: 80,
						weight: 10,
					},
				],
			});
			const highPos = result.indexOf('High Judge');
			const lowPos = result.indexOf('Low Judge');
			expect(highPos).toBeLessThan(lowPos);
		});

		it('should include previous prompts section when provided', () => {
			const result = build({
				originalBrief: 'Brief',
				judgeFeedback: [],
				previousPrompts: [
					'First attempt prompt that was very long and descriptive',
					'Second attempt with more detail',
				],
			});
			expect(result).toContain('## Previous Attempts');
			expect(result).toContain('Attempt 1:');
			expect(result).toContain('Attempt 2:');
		});

		it('should collect and dedupe promptInstructions from judges', () => {
			const result = build({
				originalBrief: 'Brief',
				judgeFeedback: [
					{
						agentId: 'a1',
						agentName: 'Judge A',
						feedback: 'ok',
						score: 70,
						weight: 1,
						promptInstructions: [
							'Add rim lighting',
							'Use blue tones',
						],
					},
					{
						agentId: 'a2',
						agentName: 'Judge B',
						feedback: 'ok',
						score: 75,
						weight: 1,
						promptInstructions: [
							'Add rim lighting',
							'Make bottle taller',
						],
					},
				],
			});
			expect(result).toContain('## JUDGE PROMPT INSTRUCTIONS');
			expect(result).toContain('Add rim lighting');
			expect(result).toContain('Use blue tones');
			expect(result).toContain('Make bottle taller');

			// "Add rim lighting" should appear only once in the instructions section
			const instrSection = result
				.split('## JUDGE PROMPT INSTRUCTIONS')[1]
				.split('## Task')[0];
			const rimMatches = instrSection.match(/Add rim lighting/g);
			expect(rimMatches).toHaveLength(1);
		});

		it('should always include the Task section with generation instructions', () => {
			const result = build({
				originalBrief: 'Brief',
				judgeFeedback: [],
			});
			expect(result).toContain('## Task');
			expect(result).toContain(
				'Generate an improved image generation prompt',
			);
			expect(result).toContain('At least 500 words');
		});

		it('should include reference image instruction in Task when hasReferenceImages is true', () => {
			const result = build({
				originalBrief: 'Brief',
				judgeFeedback: [],
				hasReferenceImages: true,
			});
			expect(result).toContain(
				'Include explicit instructions to match the provided reference images',
			);
		});

		it('should handle empty judgeFeedback', () => {
			const result = build({
				originalBrief: 'Brief',
				judgeFeedback: [],
			});
			expect(result).toContain('## Original Brief');
			expect(result).toContain('## Detailed Judge Feedback');
			expect(result).not.toContain('## CRITICAL ISSUES TO FIX');
			expect(result).not.toContain('## WHAT WORKED');
		});
	});
});
