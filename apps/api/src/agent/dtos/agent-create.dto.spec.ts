import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import {
	AgentType,
	ModelTier,
	ThinkingLevel,
	AgentStatus,
} from '../agent.entity';

import { AgentCreateDto, RagConfigDto } from './agent-create.dto';

async function validateDto(data: Record<string, unknown>) {
	const dto = plainToInstance(AgentCreateDto, data);
	return validate(dto);
}

describe('AgentCreateDto validation', () => {
	const validInput = {
		name: 'Brand Judge',
		systemPrompt: 'You are a brand compliance expert.',
	};

	// ─── Valid cases ─────────────────────────────────────────────────────────

	it('should pass with minimal required fields', async () => {
		const errors = await validateDto(validInput);
		expect(errors).toHaveLength(0);
	});

	it('should pass with all optional fields', async () => {
		const errors = await validateDto({
			...validInput,
			evaluationCategories: 'brand,quality',
			optimizationWeight: 50,
			scoringWeight: 75,
			ragConfig: { topK: 10, similarityThreshold: 0.8 },
			templateId: 'tpl-1',
			canJudge: true,
			description: 'A test agent',
			teamPrompt: 'Work as a team',
			aiSummary: 'Expert in brand compliance',
			agentType: AgentType.EXPERT,
			modelTier: ModelTier.PRO,
			thinkingLevel: ThinkingLevel.MEDIUM,
			status: AgentStatus.ACTIVE,
			capabilities: ['brand_compliance', 'color_check'],
			teamAgentIds: ['550e8400-e29b-41d4-a716-446655440000'],
			temperature: 0.7,
			maxTokens: 4096,
			avatarUrl: 'https://example.com/avatar.png',
			judgePrompt: 'Custom evaluation instructions...',
		});
		expect(errors).toHaveLength(0);
	});

	// ─── name validation ────────────────────────────────────────────────────

	describe('name', () => {
		it('should fail when name is missing', async () => {
			const errors = await validateDto({ systemPrompt: 'prompt' });
			const nameError = errors.find((e) => e.property === 'name');
			expect(nameError).toBeDefined();
		});

		it('should fail when name is empty string', async () => {
			const errors = await validateDto({
				name: '',
				systemPrompt: 'prompt',
			});
			const nameError = errors.find((e) => e.property === 'name');
			expect(nameError).toBeDefined();
		});

		it('should fail when name exceeds 255 characters', async () => {
			const errors = await validateDto({
				name: 'A'.repeat(256),
				systemPrompt: 'prompt',
			});
			const nameError = errors.find((e) => e.property === 'name');
			expect(nameError).toBeDefined();
		});

		it('should fail when name is not a string', async () => {
			const errors = await validateDto({
				name: 123,
				systemPrompt: 'prompt',
			});
			const nameError = errors.find((e) => e.property === 'name');
			expect(nameError).toBeDefined();
		});
	});

	// ─── systemPrompt validation ────────────────────────────────────────────

	describe('systemPrompt', () => {
		it('should fail when systemPrompt is missing', async () => {
			const errors = await validateDto({ name: 'Test' });
			const err = errors.find((e) => e.property === 'systemPrompt');
			expect(err).toBeDefined();
		});

		it('should fail when systemPrompt exceeds 50000 characters', async () => {
			const errors = await validateDto({
				name: 'Test',
				systemPrompt: 'A'.repeat(50001),
			});
			const err = errors.find((e) => e.property === 'systemPrompt');
			expect(err).toBeDefined();
		});
	});

	// ─── Weight fields validation ───────────────────────────────────────────

	describe('optimizationWeight', () => {
		it('should fail when below 0', async () => {
			const errors = await validateDto({
				...validInput,
				optimizationWeight: -1,
			});
			const err = errors.find((e) => e.property === 'optimizationWeight');
			expect(err).toBeDefined();
		});

		it('should fail when above 100', async () => {
			const errors = await validateDto({
				...validInput,
				optimizationWeight: 101,
			});
			const err = errors.find((e) => e.property === 'optimizationWeight');
			expect(err).toBeDefined();
		});

		it('should pass at boundary values 0 and 100', async () => {
			const errorsMin = await validateDto({
				...validInput,
				optimizationWeight: 0,
			});
			expect(
				errorsMin.find((e) => e.property === 'optimizationWeight'),
			).toBeUndefined();

			const errorsMax = await validateDto({
				...validInput,
				optimizationWeight: 100,
			});
			expect(
				errorsMax.find((e) => e.property === 'optimizationWeight'),
			).toBeUndefined();
		});

		it('should fail for non-integer value', async () => {
			const errors = await validateDto({
				...validInput,
				optimizationWeight: 50.5,
			});
			const err = errors.find((e) => e.property === 'optimizationWeight');
			expect(err).toBeDefined();
		});
	});

	// ─── temperature validation ─────────────────────────────────────────────

	describe('temperature', () => {
		it('should pass with valid float value', async () => {
			const errors = await validateDto({
				...validInput,
				temperature: 0.7,
			});
			expect(
				errors.find((e) => e.property === 'temperature'),
			).toBeUndefined();
		});

		it('should fail when below 0', async () => {
			const errors = await validateDto({
				...validInput,
				temperature: -0.1,
			});
			expect(
				errors.find((e) => e.property === 'temperature'),
			).toBeDefined();
		});

		it('should fail when above 2', async () => {
			const errors = await validateDto({
				...validInput,
				temperature: 2.1,
			});
			expect(
				errors.find((e) => e.property === 'temperature'),
			).toBeDefined();
		});

		it('should pass at boundary values 0 and 2', async () => {
			const errorsMin = await validateDto({
				...validInput,
				temperature: 0,
			});
			expect(
				errorsMin.find((e) => e.property === 'temperature'),
			).toBeUndefined();

			const errorsMax = await validateDto({
				...validInput,
				temperature: 2,
			});
			expect(
				errorsMax.find((e) => e.property === 'temperature'),
			).toBeUndefined();
		});
	});

	// ─── enum validations ───────────────────────────────────────────────────

	describe('enum fields', () => {
		it('should fail for invalid agentType', async () => {
			const errors = await validateDto({
				...validInput,
				agentType: 'INVALID',
			});
			expect(
				errors.find((e) => e.property === 'agentType'),
			).toBeDefined();
		});

		it('should pass for valid agentType values', async () => {
			for (const type of Object.values(AgentType)) {
				const errors = await validateDto({
					...validInput,
					agentType: type,
				});
				expect(
					errors.find((e) => e.property === 'agentType'),
				).toBeUndefined();
			}
		});

		it('should fail for invalid modelTier', async () => {
			const errors = await validateDto({
				...validInput,
				modelTier: 'ULTRA',
			});
			expect(
				errors.find((e) => e.property === 'modelTier'),
			).toBeDefined();
		});

		it('should fail for invalid thinkingLevel', async () => {
			const errors = await validateDto({
				...validInput,
				thinkingLevel: 'EXTREME',
			});
			expect(
				errors.find((e) => e.property === 'thinkingLevel'),
			).toBeDefined();
		});

		it('should fail for invalid status', async () => {
			const errors = await validateDto({
				...validInput,
				status: 'DELETED',
			});
			expect(errors.find((e) => e.property === 'status')).toBeDefined();
		});
	});

	// ─── avatarUrl validation ───────────────────────────────────────────────

	describe('avatarUrl', () => {
		it('should pass for valid HTTPS URL', async () => {
			const errors = await validateDto({
				...validInput,
				avatarUrl: 'https://example.com/avatar.png',
			});
			expect(
				errors.find((e) => e.property === 'avatarUrl'),
			).toBeUndefined();
		});

		it('should fail for HTTP URL (not HTTPS)', async () => {
			const errors = await validateDto({
				...validInput,
				avatarUrl: 'http://example.com/avatar.png',
			});
			expect(
				errors.find((e) => e.property === 'avatarUrl'),
			).toBeDefined();
		});

		it('should fail for non-URL string', async () => {
			const errors = await validateDto({
				...validInput,
				avatarUrl: 'not-a-url',
			});
			expect(
				errors.find((e) => e.property === 'avatarUrl'),
			).toBeDefined();
		});
	});

	// ─── teamAgentIds validation ────────────────────────────────────────────

	describe('teamAgentIds', () => {
		it('should pass with valid UUID v4 array', async () => {
			const errors = await validateDto({
				...validInput,
				teamAgentIds: [
					'550e8400-e29b-41d4-a716-446655440000',
					'a3bb189e-8bf9-4c93-9a5e-1e8e49a1f0d5',
				],
			});
			expect(
				errors.find((e) => e.property === 'teamAgentIds'),
			).toBeUndefined();
		});

		it('should fail with invalid UUID in array', async () => {
			const errors = await validateDto({
				...validInput,
				teamAgentIds: ['not-a-uuid'],
			});
			expect(
				errors.find((e) => e.property === 'teamAgentIds'),
			).toBeDefined();
		});
	});

	// ─── capabilities validation ────────────────────────────────────────────

	describe('capabilities', () => {
		it('should pass with array of strings', async () => {
			const errors = await validateDto({
				...validInput,
				capabilities: ['brand', 'color'],
			});
			expect(
				errors.find((e) => e.property === 'capabilities'),
			).toBeUndefined();
		});

		it('should fail with non-string elements', async () => {
			const errors = await validateDto({
				...validInput,
				capabilities: [123, true],
			});
			expect(
				errors.find((e) => e.property === 'capabilities'),
			).toBeDefined();
		});
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// RagConfigDto
// ═══════════════════════════════════════════════════════════════════════════

describe('RagConfigDto validation', () => {
	async function validateRagConfig(data: Record<string, unknown>) {
		const dto = plainToInstance(RagConfigDto, data);
		return validate(dto);
	}

	it('should pass with valid values', async () => {
		const errors = await validateRagConfig({
			topK: 5,
			similarityThreshold: 0.7,
		});
		expect(errors).toHaveLength(0);
	});

	it('should pass with no fields (all optional)', async () => {
		const errors = await validateRagConfig({});
		expect(errors).toHaveLength(0);
	});

	it('should fail when topK is below 1', async () => {
		const errors = await validateRagConfig({ topK: 0 });
		expect(errors.find((e) => e.property === 'topK')).toBeDefined();
	});

	it('should fail when topK exceeds 20', async () => {
		const errors = await validateRagConfig({ topK: 21 });
		expect(errors.find((e) => e.property === 'topK')).toBeDefined();
	});

	it('should fail when similarityThreshold is below 0', async () => {
		const errors = await validateRagConfig({ similarityThreshold: -0.1 });
		expect(
			errors.find((e) => e.property === 'similarityThreshold'),
		).toBeDefined();
	});

	it('should fail when similarityThreshold exceeds 1', async () => {
		const errors = await validateRagConfig({ similarityThreshold: 1.1 });
		expect(
			errors.find((e) => e.property === 'similarityThreshold'),
		).toBeDefined();
	});
});
