import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { CreateCompositionDto } from './create-composition.dto';
import { UpdateCompositionDto } from './update-composition.dto';
import {
	CreateCompositionVersionDto,
	CompositionVersionMode,
} from './create-composition-version.dto';

// ═══════════════════════════════════════════════════════════════════════════
// CreateCompositionDto
// ═══════════════════════════════════════════════════════════════════════════

describe('CreateCompositionDto validation', () => {
	async function validateDto(data: Record<string, unknown>) {
		const dto = plainToInstance(CreateCompositionDto, data);
		return validate(dto);
	}

	it('should pass with only required name field', async () => {
		const errors = await validateDto({ name: 'My Composition' });
		expect(errors).toHaveLength(0);
	});

	it('should pass with all fields', async () => {
		const errors = await validateDto({
			name: 'My Composition',
			projectId: '550e8400-e29b-41d4-a716-446655440000',
			canvasWidth: 1024,
			canvasHeight: 768,
		});
		expect(errors).toHaveLength(0);
	});

	describe('name', () => {
		it('should fail when name is missing', async () => {
			const errors = await validateDto({});
			expect(errors.find((e) => e.property === 'name')).toBeDefined();
		});

		it('should fail when name is empty string', async () => {
			const errors = await validateDto({ name: '' });
			expect(errors.find((e) => e.property === 'name')).toBeDefined();
		});

		it('should fail when name exceeds 255 characters', async () => {
			const errors = await validateDto({ name: 'A'.repeat(256) });
			expect(errors.find((e) => e.property === 'name')).toBeDefined();
		});
	});

	describe('canvasWidth', () => {
		it('should fail when below 1', async () => {
			const errors = await validateDto({
				name: 'Test',
				canvasWidth: 0,
			});
			expect(
				errors.find((e) => e.property === 'canvasWidth'),
			).toBeDefined();
		});

		it('should fail when above 4096', async () => {
			const errors = await validateDto({
				name: 'Test',
				canvasWidth: 4097,
			});
			expect(
				errors.find((e) => e.property === 'canvasWidth'),
			).toBeDefined();
		});

		it('should pass at boundary values 1 and 4096', async () => {
			const errorsMin = await validateDto({
				name: 'Test',
				canvasWidth: 1,
			});
			expect(
				errorsMin.find((e) => e.property === 'canvasWidth'),
			).toBeUndefined();

			const errorsMax = await validateDto({
				name: 'Test',
				canvasWidth: 4096,
			});
			expect(
				errorsMax.find((e) => e.property === 'canvasWidth'),
			).toBeUndefined();
		});
	});

	describe('canvasHeight', () => {
		it('should fail when below 1', async () => {
			const errors = await validateDto({
				name: 'Test',
				canvasHeight: 0,
			});
			expect(
				errors.find((e) => e.property === 'canvasHeight'),
			).toBeDefined();
		});

		it('should fail when above 4096', async () => {
			const errors = await validateDto({
				name: 'Test',
				canvasHeight: 4097,
			});
			expect(
				errors.find((e) => e.property === 'canvasHeight'),
			).toBeDefined();
		});
	});

	describe('projectId', () => {
		it('should fail with invalid UUID', async () => {
			const errors = await validateDto({
				name: 'Test',
				projectId: 'not-a-uuid',
			});
			expect(
				errors.find((e) => e.property === 'projectId'),
			).toBeDefined();
		});

		it('should pass with valid UUID', async () => {
			const errors = await validateDto({
				name: 'Test',
				projectId: '550e8400-e29b-41d4-a716-446655440000',
			});
			expect(
				errors.find((e) => e.property === 'projectId'),
			).toBeUndefined();
		});
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// UpdateCompositionDto
// ═══════════════════════════════════════════════════════════════════════════

describe('UpdateCompositionDto validation', () => {
	async function validateDto(data: Record<string, unknown>) {
		const dto = plainToInstance(UpdateCompositionDto, data);
		return validate(dto);
	}

	it('should pass with empty object (all optional)', async () => {
		const errors = await validateDto({});
		expect(errors).toHaveLength(0);
	});

	it('should pass with valid name update', async () => {
		const errors = await validateDto({ name: 'Updated Name' });
		expect(errors).toHaveLength(0);
	});

	it('should pass with canvasState object', async () => {
		const errors = await validateDto({
			canvasState: { version: '1.0', objects: [] },
		});
		expect(errors).toHaveLength(0);
	});

	it('should fail when name is empty string', async () => {
		const errors = await validateDto({ name: '' });
		expect(errors.find((e) => e.property === 'name')).toBeDefined();
	});

	it('should fail when name exceeds 255 characters', async () => {
		const errors = await validateDto({ name: 'A'.repeat(256) });
		expect(errors.find((e) => e.property === 'name')).toBeDefined();
	});

	it('should fail when canvasWidth is below 1', async () => {
		const errors = await validateDto({ canvasWidth: 0 });
		expect(errors.find((e) => e.property === 'canvasWidth')).toBeDefined();
	});

	it('should fail when canvasHeight exceeds 4096', async () => {
		const errors = await validateDto({ canvasHeight: 4097 });
		expect(errors.find((e) => e.property === 'canvasHeight')).toBeDefined();
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// CreateCompositionVersionDto
// ═══════════════════════════════════════════════════════════════════════════

describe('CreateCompositionVersionDto validation', () => {
	async function validateDto(data: Record<string, unknown>) {
		const dto = plainToInstance(CreateCompositionVersionDto, data);
		return validate(dto);
	}

	it('should pass with only required mode field', async () => {
		const errors = await validateDto({
			mode: CompositionVersionMode.UPLOAD,
		});
		expect(errors).toHaveLength(0);
	});

	it('should pass with all valid fields', async () => {
		const errors = await validateDto({
			mode: CompositionVersionMode.GENERATE,
			prompt: 'Generate a product photo',
			boundingBox: { left: 0, top: 0, width: 100, height: 100 },
			backgroundImage: 'base64data',
			maskImage: 'base64mask',
			canvasStateSnapshot: { version: '1.0', objects: [] },
		});
		expect(errors).toHaveLength(0);
	});

	describe('mode', () => {
		it('should fail when mode is missing', async () => {
			const errors = await validateDto({});
			expect(errors.find((e) => e.property === 'mode')).toBeDefined();
		});

		it('should fail for invalid mode', async () => {
			const errors = await validateDto({ mode: 'INVALID' });
			expect(errors.find((e) => e.property === 'mode')).toBeDefined();
		});

		it('should pass for all valid modes', async () => {
			for (const mode of Object.values(CompositionVersionMode)) {
				const errors = await validateDto({ mode });
				expect(
					errors.find((e) => e.property === 'mode'),
				).toBeUndefined();
			}
		});
	});

	describe('prompt', () => {
		it('should fail when prompt exceeds 10000 characters', async () => {
			const errors = await validateDto({
				mode: CompositionVersionMode.GENERATE,
				prompt: 'A'.repeat(10001),
			});
			expect(errors.find((e) => e.property === 'prompt')).toBeDefined();
		});

		it('should pass at maxLength boundary', async () => {
			const errors = await validateDto({
				mode: CompositionVersionMode.GENERATE,
				prompt: 'A'.repeat(10000),
			});
			expect(errors.find((e) => e.property === 'prompt')).toBeUndefined();
		});
	});
});
