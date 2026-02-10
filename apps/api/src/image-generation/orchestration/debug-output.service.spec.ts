/**
 * Pure-logic unit tests for DebugOutputService.
 *
 * These tests focus on the enabled/disabled toggle and path generation logic.
 * We avoid filesystem side-effects by testing the logic paths that determine
 * what would happen, rather than actually writing files.
 */
import { DebugOutputService } from './debug-output.service';

describe('DebugOutputService — pure logic', () => {
	const originalEnv = process.env;

	afterEach(() => {
		process.env = originalEnv;
	});

	// ─── isEnabled() ────────────────────────────────────────────────────────

	describe('isEnabled()', () => {
		it('should return false when IMAGE_GEN_DEBUG_OUTPUT is not set', () => {
			process.env = { ...originalEnv };
			delete process.env.IMAGE_GEN_DEBUG_OUTPUT;
			const service = new DebugOutputService();
			expect(service.isEnabled()).toBe(false);
		});

		it('should return true when IMAGE_GEN_DEBUG_OUTPUT is "true"', () => {
			process.env = { ...originalEnv, IMAGE_GEN_DEBUG_OUTPUT: 'true' };
			const service = new DebugOutputService();
			expect(service.isEnabled()).toBe(true);
		});

		it('should return false when IMAGE_GEN_DEBUG_OUTPUT is "false"', () => {
			process.env = { ...originalEnv, IMAGE_GEN_DEBUG_OUTPUT: 'false' };
			const service = new DebugOutputService();
			expect(service.isEnabled()).toBe(false);
		});

		it('should return false when IMAGE_GEN_DEBUG_OUTPUT is empty string', () => {
			process.env = { ...originalEnv, IMAGE_GEN_DEBUG_OUTPUT: '' };
			const service = new DebugOutputService();
			expect(service.isEnabled()).toBe(false);
		});
	});

	// ─── initSession() when disabled ────────────────────────────────────────

	describe('initSession() when disabled', () => {
		it('should return empty object when debug is disabled', () => {
			process.env = { ...originalEnv };
			delete process.env.IMAGE_GEN_DEBUG_OUTPUT;
			const service = new DebugOutputService();
			const log = service.initSession(
				'req-1',
				'org-1',
				'Test brief',
				85,
				10,
				[{ id: 'a1', name: 'Judge', weight: 1 }],
			);
			// Returns {} when disabled
			expect(Object.keys(log)).toHaveLength(0);
		});
	});

	// ─── saveImage() when disabled ──────────────────────────────────────────

	describe('saveImage() when disabled', () => {
		it('should return null when debug is disabled', () => {
			process.env = { ...originalEnv };
			delete process.env.IMAGE_GEN_DEBUG_OUTPUT;
			const service = new DebugOutputService();
			const result = service.saveImage(
				'req-1',
				1,
				'img-1',
				Buffer.from('fake'),
				'image/jpeg',
			);
			expect(result).toBeNull();
		});
	});

	// ─── saveIteration() when disabled ──────────────────────────────────────

	describe('saveIteration() when disabled', () => {
		it('should be a no-op when debug is disabled', () => {
			process.env = { ...originalEnv };
			delete process.env.IMAGE_GEN_DEBUG_OUTPUT;
			const service = new DebugOutputService();
			// Should not throw
			expect(() =>
				service.saveIteration('req-1', {
					iterationNumber: 1,
					optimizedPrompt: 'test',
					images: [],
					evaluations: [],
					aggregateScore: 50,
					selectedImageId: 'img-1',
					timestamp: new Date().toISOString(),
				}),
			).not.toThrow();
		});
	});

	// ─── saveFinalResult() when disabled ────────────────────────────────────

	describe('saveFinalResult() when disabled', () => {
		it('should be a no-op when debug is disabled', () => {
			process.env = { ...originalEnv };
			delete process.env.IMAGE_GEN_DEBUG_OUTPUT;
			const service = new DebugOutputService();
			// Should not throw
			expect(() =>
				service.saveFinalResult(
					'req-1',
					'completed',
					'Threshold met',
					85,
					'img-1',
					5000,
				),
			).not.toThrow();
		});
	});

	// ─── getCompositionDir() when disabled ──────────────────────────────────

	describe('getCompositionDir() when disabled', () => {
		it('should return null when debug is disabled', () => {
			process.env = { ...originalEnv };
			delete process.env.IMAGE_GEN_DEBUG_OUTPUT;
			const service = new DebugOutputService();
			expect(service.getCompositionDir('version-1')).toBeNull();
		});
	});

	// ─── saveFile() when disabled ───────────────────────────────────────────

	describe('saveFile() when disabled', () => {
		it('should be a no-op when debug is disabled', () => {
			process.env = { ...originalEnv };
			delete process.env.IMAGE_GEN_DEBUG_OUTPUT;
			const service = new DebugOutputService();
			// Should not throw
			expect(() =>
				service.saveFile('/tmp', 'test.txt', 'content'),
			).not.toThrow();
		});
	});
});
