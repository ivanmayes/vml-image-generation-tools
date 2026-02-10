import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { GenerationMode } from '../../entities/generation-request.entity';

import { RequestContinueDto } from './request-continue.dto';

async function validateDto(data: Record<string, unknown>) {
	const dto = plainToInstance(RequestContinueDto, data);
	return validate(dto);
}

describe('RequestContinueDto validation', () => {
	// ─── Valid cases ─────────────────────────────────────────────────────────

	it('should pass with empty object (all fields optional)', async () => {
		const errors = await validateDto({});
		expect(errors).toHaveLength(0);
	});

	it('should pass with all valid fields', async () => {
		const errors = await validateDto({
			promptOverride: 'Override prompt text',
			additionalIterations: 10,
			judgeIds: ['550e8400-e29b-41d4-a716-446655440000'],
			generationMode: GenerationMode.EDIT,
		});
		expect(errors).toHaveLength(0);
	});

	// ─── promptOverride validation ──────────────────────────────────────────

	describe('promptOverride', () => {
		it('should fail when promptOverride exceeds 10000 characters', async () => {
			const errors = await validateDto({
				promptOverride: 'A'.repeat(10001),
			});
			expect(
				errors.find((e) => e.property === 'promptOverride'),
			).toBeDefined();
		});

		it('should pass at maxLength boundary', async () => {
			const errors = await validateDto({
				promptOverride: 'A'.repeat(10000),
			});
			expect(
				errors.find((e) => e.property === 'promptOverride'),
			).toBeUndefined();
		});
	});

	// ─── additionalIterations validation ────────────────────────────────────

	describe('additionalIterations', () => {
		it('should fail when below 1', async () => {
			const errors = await validateDto({ additionalIterations: 0 });
			expect(
				errors.find((e) => e.property === 'additionalIterations'),
			).toBeDefined();
		});

		it('should fail when above 50', async () => {
			const errors = await validateDto({ additionalIterations: 51 });
			expect(
				errors.find((e) => e.property === 'additionalIterations'),
			).toBeDefined();
		});

		it('should pass at boundary values 1 and 50', async () => {
			const errorsMin = await validateDto({ additionalIterations: 1 });
			expect(
				errorsMin.find((e) => e.property === 'additionalIterations'),
			).toBeUndefined();

			const errorsMax = await validateDto({ additionalIterations: 50 });
			expect(
				errorsMax.find((e) => e.property === 'additionalIterations'),
			).toBeUndefined();
		});
	});

	// ─── judgeIds validation ────────────────────────────────────────────────

	describe('judgeIds', () => {
		it('should fail with invalid UUIDs', async () => {
			const errors = await validateDto({
				judgeIds: ['not-valid', 'also-not-valid'],
			});
			expect(errors.find((e) => e.property === 'judgeIds')).toBeDefined();
		});

		it('should pass with valid UUIDs', async () => {
			const errors = await validateDto({
				judgeIds: ['550e8400-e29b-41d4-a716-446655440000'],
			});
			expect(errors).toHaveLength(0);
		});
	});

	// ─── generationMode validation ──────────────────────────────────────────

	describe('generationMode', () => {
		it('should pass for all valid modes', async () => {
			for (const mode of Object.values(GenerationMode)) {
				const errors = await validateDto({ generationMode: mode });
				expect(
					errors.find((e) => e.property === 'generationMode'),
				).toBeUndefined();
			}
		});

		it('should fail for invalid mode', async () => {
			const errors = await validateDto({ generationMode: 'INVALID' });
			expect(
				errors.find((e) => e.property === 'generationMode'),
			).toBeDefined();
		});
	});
});
