import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { GenerationMode } from '../../entities/generation-request.entity';

import { RequestCreateDto, ImageParamsDto } from './request-create.dto';

async function validateDto(data: Record<string, unknown>) {
	const dto = plainToInstance(RequestCreateDto, data);
	return validate(dto);
}

describe('RequestCreateDto validation', () => {
	const validInput = {
		brief: 'Create a product photo of a Coca-Cola bottle',
		judgeIds: ['550e8400-e29b-41d4-a716-446655440000'],
	};

	// ─── Valid cases ─────────────────────────────────────────────────────────

	it('should pass with minimal required fields', async () => {
		const errors = await validateDto(validInput);
		expect(errors).toHaveLength(0);
	});

	it('should pass with all optional fields', async () => {
		const errors = await validateDto({
			...validInput,
			initialPrompt: 'Start with a wide shot',
			referenceImageUrls: ['https://example.com/ref1.jpg'],
			negativePrompts: 'No text overlay',
			imageParams: {
				aspectRatio: '16:9',
				quality: '2K',
				imagesPerGeneration: 3,
				plateauWindowSize: 3,
				plateauThreshold: 0.05,
			},
			threshold: 85,
			maxIterations: 10,
			projectId: '550e8400-e29b-41d4-a716-446655440000',
			spaceId: '550e8400-e29b-41d4-a716-446655440000',
			generationMode: GenerationMode.MIXED,
		});
		expect(errors).toHaveLength(0);
	});

	// ─── brief validation ───────────────────────────────────────────────────

	describe('brief', () => {
		it('should fail when brief is missing', async () => {
			const errors = await validateDto({ judgeIds: validInput.judgeIds });
			expect(errors.find((e) => e.property === 'brief')).toBeDefined();
		});

		it('should fail when brief is empty', async () => {
			const errors = await validateDto({
				brief: '',
				judgeIds: validInput.judgeIds,
			});
			expect(errors.find((e) => e.property === 'brief')).toBeDefined();
		});

		it('should fail when brief exceeds 10000 characters', async () => {
			const errors = await validateDto({
				brief: 'A'.repeat(10001),
				judgeIds: validInput.judgeIds,
			});
			expect(errors.find((e) => e.property === 'brief')).toBeDefined();
		});
	});

	// ─── judgeIds validation ────────────────────────────────────────────────

	describe('judgeIds', () => {
		it('should fail when judgeIds is missing', async () => {
			const errors = await validateDto({ brief: 'Test' });
			expect(errors.find((e) => e.property === 'judgeIds')).toBeDefined();
		});

		it('should fail when judgeIds is empty array', async () => {
			const errors = await validateDto({ brief: 'Test', judgeIds: [] });
			expect(errors.find((e) => e.property === 'judgeIds')).toBeDefined();
		});

		it('should fail when judgeIds contains non-UUID strings', async () => {
			const errors = await validateDto({
				brief: 'Test',
				judgeIds: ['not-a-uuid'],
			});
			expect(errors.find((e) => e.property === 'judgeIds')).toBeDefined();
		});

		it('should pass with multiple valid v4 UUIDs', async () => {
			const errors = await validateDto({
				brief: 'Test',
				judgeIds: [
					'550e8400-e29b-41d4-a716-446655440000',
					'a3bb189e-8bf9-4c93-9a5e-1e8e49a1f0d5',
				],
			});
			expect(errors).toHaveLength(0);
		});
	});

	// ─── referenceImageUrls validation ──────────────────────────────────────

	describe('referenceImageUrls', () => {
		it('should pass with valid HTTPS URLs', async () => {
			const errors = await validateDto({
				...validInput,
				referenceImageUrls: [
					'https://example.com/image1.jpg',
					'https://cdn.example.com/image2.png',
				],
			});
			expect(
				errors.find((e) => e.property === 'referenceImageUrls'),
			).toBeUndefined();
		});

		it('should fail with HTTP URL (must be HTTPS)', async () => {
			const errors = await validateDto({
				...validInput,
				referenceImageUrls: ['http://example.com/image.jpg'],
			});
			expect(
				errors.find((e) => e.property === 'referenceImageUrls'),
			).toBeDefined();
		});

		it('should fail with non-URL string', async () => {
			const errors = await validateDto({
				...validInput,
				referenceImageUrls: ['not-a-url'],
			});
			expect(
				errors.find((e) => e.property === 'referenceImageUrls'),
			).toBeDefined();
		});
	});

	// ─── threshold validation ───────────────────────────────────────────────

	describe('threshold', () => {
		it('should pass with value between 1 and 100', async () => {
			const errors = await validateDto({ ...validInput, threshold: 85 });
			expect(
				errors.find((e) => e.property === 'threshold'),
			).toBeUndefined();
		});

		it('should fail when below 1', async () => {
			const errors = await validateDto({ ...validInput, threshold: 0 });
			expect(
				errors.find((e) => e.property === 'threshold'),
			).toBeDefined();
		});

		it('should fail when above 100', async () => {
			const errors = await validateDto({ ...validInput, threshold: 101 });
			expect(
				errors.find((e) => e.property === 'threshold'),
			).toBeDefined();
		});
	});

	// ─── maxIterations validation ───────────────────────────────────────────

	describe('maxIterations', () => {
		it('should pass with value between 1 and 50', async () => {
			const errors = await validateDto({
				...validInput,
				maxIterations: 10,
			});
			expect(
				errors.find((e) => e.property === 'maxIterations'),
			).toBeUndefined();
		});

		it('should fail when below 1', async () => {
			const errors = await validateDto({
				...validInput,
				maxIterations: 0,
			});
			expect(
				errors.find((e) => e.property === 'maxIterations'),
			).toBeDefined();
		});

		it('should fail when above 50', async () => {
			const errors = await validateDto({
				...validInput,
				maxIterations: 51,
			});
			expect(
				errors.find((e) => e.property === 'maxIterations'),
			).toBeDefined();
		});
	});

	// ─── generationMode enum ────────────────────────────────────────────────

	describe('generationMode', () => {
		it('should pass for all valid GenerationMode values', async () => {
			for (const mode of Object.values(GenerationMode)) {
				const errors = await validateDto({
					...validInput,
					generationMode: mode,
				});
				expect(
					errors.find((e) => e.property === 'generationMode'),
				).toBeUndefined();
			}
		});

		it('should fail for invalid enum value', async () => {
			const errors = await validateDto({
				...validInput,
				generationMode: 'INVALID',
			});
			expect(
				errors.find((e) => e.property === 'generationMode'),
			).toBeDefined();
		});
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// ImageParamsDto
// ═══════════════════════════════════════════════════════════════════════════

describe('ImageParamsDto validation', () => {
	async function validateImageParams(data: Record<string, unknown>) {
		const dto = plainToInstance(ImageParamsDto, data);
		return validate(dto);
	}

	it('should pass with all optional fields empty', async () => {
		const errors = await validateImageParams({});
		expect(errors).toHaveLength(0);
	});

	it('should pass with valid values', async () => {
		const errors = await validateImageParams({
			aspectRatio: '16:9',
			quality: '2K',
			imagesPerGeneration: 3,
			plateauWindowSize: 5,
			plateauThreshold: 0.1,
		});
		expect(errors).toHaveLength(0);
	});

	it('should fail when imagesPerGeneration is below 1', async () => {
		const errors = await validateImageParams({ imagesPerGeneration: 0 });
		expect(
			errors.find((e) => e.property === 'imagesPerGeneration'),
		).toBeDefined();
	});

	it('should fail when imagesPerGeneration exceeds 4', async () => {
		const errors = await validateImageParams({ imagesPerGeneration: 5 });
		expect(
			errors.find((e) => e.property === 'imagesPerGeneration'),
		).toBeDefined();
	});

	it('should fail when plateauWindowSize is below 2', async () => {
		const errors = await validateImageParams({ plateauWindowSize: 1 });
		expect(
			errors.find((e) => e.property === 'plateauWindowSize'),
		).toBeDefined();
	});

	it('should fail when plateauWindowSize exceeds 10', async () => {
		const errors = await validateImageParams({ plateauWindowSize: 11 });
		expect(
			errors.find((e) => e.property === 'plateauWindowSize'),
		).toBeDefined();
	});

	it('should fail when plateauThreshold is below 0.001', async () => {
		const errors = await validateImageParams({ plateauThreshold: 0.0005 });
		expect(
			errors.find((e) => e.property === 'plateauThreshold'),
		).toBeDefined();
	});

	it('should fail when plateauThreshold exceeds 0.5', async () => {
		const errors = await validateImageParams({ plateauThreshold: 0.6 });
		expect(
			errors.find((e) => e.property === 'plateauThreshold'),
		).toBeDefined();
	});
});
