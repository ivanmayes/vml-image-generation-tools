import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import {
	AgentType,
	ModelTier,
	ThinkingLevel,
	AgentStatus,
} from '../agent.entity';

import { AgentUpdateDto } from './agent-update.dto';

async function validateDto(data: Record<string, unknown>) {
	const dto = plainToInstance(AgentUpdateDto, data);
	return validate(dto);
}

describe('AgentUpdateDto validation', () => {
	// ─── Valid cases ─────────────────────────────────────────────────────────

	it('should pass with empty object (all fields are optional)', async () => {
		const errors = await validateDto({});
		expect(errors).toHaveLength(0);
	});

	it('should pass with only name', async () => {
		const errors = await validateDto({ name: 'Updated Name' });
		expect(errors).toHaveLength(0);
	});

	it('should pass with all valid fields', async () => {
		const errors = await validateDto({
			name: 'Updated Agent',
			systemPrompt: 'Updated system prompt',
			evaluationCategories: 'brand,quality',
			optimizationWeight: 60,
			scoringWeight: 70,
			ragConfig: { topK: 3, similarityThreshold: 0.5 },
			templateId: 'tpl-2',
			canJudge: false,
			description: 'Updated description',
			teamPrompt: 'Updated team prompt',
			aiSummary: 'Updated summary',
			agentType: AgentType.AUDIENCE,
			modelTier: ModelTier.FLASH,
			thinkingLevel: ThinkingLevel.HIGH,
			status: AgentStatus.INACTIVE,
			capabilities: ['new_capability'],
			teamAgentIds: ['550e8400-e29b-41d4-a716-446655440000'],
			temperature: 1.5,
			maxTokens: 8192,
			avatarUrl: 'https://example.com/new-avatar.png',
			judgePrompt: 'Updated judge prompt',
		});
		expect(errors).toHaveLength(0);
	});

	// ─── judgePrompt null-clearing ──────────────────────────────────────────

	describe('judgePrompt', () => {
		it('should pass with null judgePrompt (to clear it)', async () => {
			const errors = await validateDto({ judgePrompt: null });
			expect(errors).toHaveLength(0);
		});

		it('should pass with valid string judgePrompt', async () => {
			const errors = await validateDto({
				judgePrompt: 'Custom evaluation format...',
			});
			expect(errors).toHaveLength(0);
		});

		it('should transform empty string judgePrompt to null', async () => {
			const dto = plainToInstance(AgentUpdateDto, { judgePrompt: '  ' });
			// After transform, judgePrompt should be null
			expect(dto.judgePrompt).toBeNull();
			const errors = await validate(dto);
			expect(errors).toHaveLength(0);
		});

		it('should fail when judgePrompt exceeds 50000 characters', async () => {
			const errors = await validateDto({
				judgePrompt: 'A'.repeat(50001),
			});
			expect(
				errors.find((e) => e.property === 'judgePrompt'),
			).toBeDefined();
		});
	});

	// ─── Validation failures ────────────────────────────────────────────────

	describe('validation failures', () => {
		it('should fail when name exceeds 255 characters', async () => {
			const errors = await validateDto({ name: 'A'.repeat(256) });
			expect(errors.find((e) => e.property === 'name')).toBeDefined();
		});

		it('should fail when scoringWeight is below 0', async () => {
			const errors = await validateDto({ scoringWeight: -1 });
			expect(
				errors.find((e) => e.property === 'scoringWeight'),
			).toBeDefined();
		});

		it('should fail when scoringWeight exceeds 100', async () => {
			const errors = await validateDto({ scoringWeight: 101 });
			expect(
				errors.find((e) => e.property === 'scoringWeight'),
			).toBeDefined();
		});

		it('should fail when temperature exceeds 2', async () => {
			const errors = await validateDto({ temperature: 3 });
			expect(
				errors.find((e) => e.property === 'temperature'),
			).toBeDefined();
		});

		it('should fail when maxTokens is below 1', async () => {
			const errors = await validateDto({ maxTokens: 0 });
			expect(
				errors.find((e) => e.property === 'maxTokens'),
			).toBeDefined();
		});

		it('should fail when maxTokens exceeds 1000000', async () => {
			const errors = await validateDto({ maxTokens: 1000001 });
			expect(
				errors.find((e) => e.property === 'maxTokens'),
			).toBeDefined();
		});

		it('should fail for invalid enum values', async () => {
			const errors = await validateDto({
				agentType: 'INVALID',
				modelTier: 'INVALID',
				status: 'INVALID',
			});
			expect(
				errors.find((e) => e.property === 'agentType'),
			).toBeDefined();
			expect(
				errors.find((e) => e.property === 'modelTier'),
			).toBeDefined();
			expect(errors.find((e) => e.property === 'status')).toBeDefined();
		});

		it('should fail for HTTP (non-HTTPS) avatarUrl', async () => {
			const errors = await validateDto({
				avatarUrl: 'http://example.com/avatar.png',
			});
			expect(
				errors.find((e) => e.property === 'avatarUrl'),
			).toBeDefined();
		});

		it('should fail when teamAgentIds contains invalid UUIDs', async () => {
			const errors = await validateDto({
				teamAgentIds: ['not-a-uuid', '123'],
			});
			expect(
				errors.find((e) => e.property === 'teamAgentIds'),
			).toBeDefined();
		});
	});
});
