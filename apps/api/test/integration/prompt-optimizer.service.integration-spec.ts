import { DataSource, Repository } from 'typeorm';

import {
	PromptOptimizer,
	DEFAULT_OPTIMIZER_PROMPT,
} from '../../src/image-generation/entities/prompt-optimizer.entity';
import { TestDatabaseManager } from '../test-database.config';

/**
 * PromptOptimizerService Integration Tests (Repository-level)
 *
 * Tests hit a REAL PostgreSQL database. Zero mocks.
 *
 * Note: PromptOptimizerService depends on AIService and DocumentProcessorService
 * for the optimizePrompt(), buildEditInstruction(), and getAgentRagContext() flows
 * which call external AI providers. We test the CRUD and singleton logic directly
 * via repositories here. The full AI-driven flows belong in E2E tests with mocked
 * AI providers.
 */
describe('PromptOptimizerService (Integration)', () => {
	let dbManager: TestDatabaseManager;
	let ds: DataSource;
	let optimizerRepo: Repository<PromptOptimizer>;

	beforeAll(async () => {
		console.log('[PromptOptimizer] Initializing test database...');
		dbManager = new TestDatabaseManager();
		ds = await dbManager.initialize();
		console.log('[PromptOptimizer] DB connected.');

		optimizerRepo = ds.getRepository(PromptOptimizer);
	});

	beforeEach(async () => {
		console.log('[PromptOptimizer] Truncating tables...');
		await dbManager.reset();
	});

	afterAll(async () => {
		console.log('[PromptOptimizer] Closing database connection...');
		await dbManager.destroy();
	});

	// ── Singleton pattern (getOrCreateOptimizer) ─────────────────────────────

	describe('Singleton pattern (getOrCreateOptimizer equivalent)', () => {
		it('should create optimizer with default systemPrompt on first insert', async () => {
			const optimizer = optimizerRepo.create({
				systemPrompt: DEFAULT_OPTIMIZER_PROMPT,
			});
			const saved = await optimizerRepo.save(optimizer);

			expect(saved.id).toBeDefined();
			expect(saved.systemPrompt).toBe(DEFAULT_OPTIMIZER_PROMPT);
			expect(saved.config).toEqual({
				model: 'gemini-2.0-flash',
				temperature: 0.7,
			});
			expect(saved.updatedAt).toBeDefined();
		});

		it('should return existing optimizer on subsequent findOne', async () => {
			// Create the singleton
			const first = optimizerRepo.create({
				systemPrompt: DEFAULT_OPTIMIZER_PROMPT,
			});
			await optimizerRepo.save(first);

			// Simulate getOrCreateOptimizer: findOne with empty where
			const found = await optimizerRepo.findOne({ where: {} });
			expect(found).not.toBeNull();
			expect(found!.id).toBe(first.id);
			expect(found!.systemPrompt).toBe(DEFAULT_OPTIMIZER_PROMPT);
		});

		it('should only ever have one row (singleton behavior)', async () => {
			// Create first optimizer
			const first = optimizerRepo.create({
				systemPrompt: DEFAULT_OPTIMIZER_PROMPT,
			});
			await optimizerRepo.save(first);

			// Simulate "getOrCreateOptimizer" — check if exists, use it
			let optimizer = await optimizerRepo.findOne({ where: {} });
			if (!optimizer) {
				optimizer = optimizerRepo.create({
					systemPrompt: DEFAULT_OPTIMIZER_PROMPT,
				});
				optimizer = await optimizerRepo.save(optimizer);
			}

			// Verify only one row
			const count = await optimizerRepo.count();
			expect(count).toBe(1);
			expect(optimizer.id).toBe(first.id);
		});

		it('should return null when no optimizer exists', async () => {
			const found = await optimizerRepo.findOne({ where: {} });
			expect(found).toBeNull();
		});
	});

	// ── Update optimizer (updateOptimizer) ───────────────────────────────────

	describe('Update optimizer (updateOptimizer equivalent)', () => {
		it('should update systemPrompt', async () => {
			const optimizer = optimizerRepo.create({
				systemPrompt: DEFAULT_OPTIMIZER_PROMPT,
			});
			await optimizerRepo.save(optimizer);

			const newPrompt = 'You are a custom optimizer.';
			optimizer.systemPrompt = newPrompt;
			const updated = await optimizerRepo.save(optimizer);

			expect(updated.systemPrompt).toBe(newPrompt);

			// Verify persisted
			const found = await optimizerRepo.findOne({
				where: { id: updated.id },
			});
			expect(found!.systemPrompt).toBe(newPrompt);
		});

		it('should merge config without overwriting existing keys', async () => {
			const optimizer = optimizerRepo.create({
				systemPrompt: DEFAULT_OPTIMIZER_PROMPT,
				config: {
					model: 'gemini-2.0-flash',
					temperature: 0.7,
				},
			});
			await optimizerRepo.save(optimizer);

			// Merge new config (simulating updateOptimizer logic)
			optimizer.config = {
				...optimizer.config,
				temperature: 0.5,
				maxTokens: 2000,
			};
			const updated = await optimizerRepo.save(optimizer);

			expect(updated.config.model).toBe('gemini-2.0-flash'); // preserved
			expect(updated.config.temperature).toBe(0.5); // updated
			expect(updated.config.maxTokens).toBe(2000); // added
		});

		it('should update config model', async () => {
			const optimizer = optimizerRepo.create({
				systemPrompt: DEFAULT_OPTIMIZER_PROMPT,
			});
			await optimizerRepo.save(optimizer);

			optimizer.config = {
				...optimizer.config,
				model: 'gemini-2.5-pro',
			};
			const updated = await optimizerRepo.save(optimizer);

			expect(updated.config.model).toBe('gemini-2.5-pro');
		});

		it('should update updatedAt timestamp on save', async () => {
			const optimizer = optimizerRepo.create({
				systemPrompt: DEFAULT_OPTIMIZER_PROMPT,
			});
			const saved = await optimizerRepo.save(optimizer);
			const firstUpdatedAt = saved.updatedAt;

			// Wait a small amount to ensure timestamp differs
			await new Promise((resolve) => setTimeout(resolve, 50));

			saved.systemPrompt = 'Updated prompt';
			const updated = await optimizerRepo.save(saved);

			expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
				firstUpdatedAt.getTime(),
			);
		});

		it('should handle replacing entire config', async () => {
			const optimizer = optimizerRepo.create({
				systemPrompt: DEFAULT_OPTIMIZER_PROMPT,
				config: {
					model: 'gemini-2.0-flash',
					temperature: 0.7,
					maxTokens: 1000,
				},
			});
			await optimizerRepo.save(optimizer);

			// Replace entire config (not merging)
			optimizer.config = {
				model: 'gpt-4',
				temperature: 0.3,
			};
			const updated = await optimizerRepo.save(optimizer);

			expect(updated.config.model).toBe('gpt-4');
			expect(updated.config.temperature).toBe(0.3);
			expect(updated.config.maxTokens).toBeUndefined();
		});
	});

	// ── JSONB config column ──────────────────────────────────────────────────

	describe('JSONB config column', () => {
		it('should store and retrieve complex config as JSONB', async () => {
			const optimizer = optimizerRepo.create({
				systemPrompt: 'Test prompt',
				config: {
					model: 'custom-model',
					temperature: 0.9,
					maxTokens: 4096,
				},
			});
			const saved = await optimizerRepo.save(optimizer);

			const found = await optimizerRepo.findOne({
				where: { id: saved.id },
			});
			expect(found!.config).toBeDefined();
			expect(found!.config.model).toBe('custom-model');
			expect(found!.config.temperature).toBe(0.9);
			expect(found!.config.maxTokens).toBe(4096);
		});

		it('should apply default config when not specified', async () => {
			const optimizer = optimizerRepo.create({
				systemPrompt: 'Test prompt',
			});
			const saved = await optimizerRepo.save(optimizer);

			const found = await optimizerRepo.findOne({
				where: { id: saved.id },
			});
			expect(found!.config).toEqual({
				model: 'gemini-2.0-flash',
				temperature: 0.7,
			});
		});

		it('should handle minimal config', async () => {
			const optimizer = optimizerRepo.create({
				systemPrompt: 'Test prompt',
				config: { model: 'simple' },
			});
			const saved = await optimizerRepo.save(optimizer);

			const found = await optimizerRepo.findOne({
				where: { id: saved.id },
			});
			expect(found!.config.model).toBe('simple');
		});
	});

	// ── toPublic() ───────────────────────────────────────────────────────────

	describe('toPublic()', () => {
		it('should return only public fields', async () => {
			const optimizer = optimizerRepo.create({
				systemPrompt: DEFAULT_OPTIMIZER_PROMPT,
			});
			const saved = await optimizerRepo.save(optimizer);

			const found = await optimizerRepo.findOne({
				where: { id: saved.id },
			});
			const pub = found!.toPublic();

			expect(pub.id).toBe(saved.id);
			expect(pub.systemPrompt).toBe(DEFAULT_OPTIMIZER_PROMPT);
			expect(pub.config).toBeDefined();
			expect(pub.updatedAt).toBeDefined();
			// Ensure no extra keys leak
			const keys = Object.keys(pub);
			expect(keys).toEqual(
				expect.arrayContaining([
					'id',
					'systemPrompt',
					'config',
					'updatedAt',
				]),
			);
			expect(keys).toHaveLength(4);
		});
	});

	// ── DEFAULT_OPTIMIZER_PROMPT constant ────────────────────────────────────

	describe('DEFAULT_OPTIMIZER_PROMPT constant', () => {
		it('should contain required section headers', () => {
			expect(DEFAULT_OPTIMIZER_PROMPT).toContain('TECHNICAL PARAMETERS');
			expect(DEFAULT_OPTIMIZER_PROMPT).toContain(
				'COMPOSITION & NARRATIVE',
			);
			expect(DEFAULT_OPTIMIZER_PROMPT).toContain('SETTING & AMBIANCE');
			expect(DEFAULT_OPTIMIZER_PROMPT).toContain('KEY OBJECTS');
			expect(DEFAULT_OPTIMIZER_PROMPT).toContain('FINAL NOTES');
		});

		it('should mention critical rules', () => {
			expect(DEFAULT_OPTIMIZER_PROMPT).toContain('CRITICAL RULES');
			expect(DEFAULT_OPTIMIZER_PROMPT).toContain('500');
		});
	});

	// ── Edge cases ───────────────────────────────────────────────────────────

	describe('Edge cases', () => {
		it('should handle very long systemPrompt (text column)', async () => {
			const longPrompt = 'A'.repeat(50000);
			const optimizer = optimizerRepo.create({
				systemPrompt: longPrompt,
			});
			const saved = await optimizerRepo.save(optimizer);

			const found = await optimizerRepo.findOne({
				where: { id: saved.id },
			});
			expect(found!.systemPrompt).toBe(longPrompt);
			expect(found!.systemPrompt.length).toBe(50000);
		});

		it('should handle empty systemPrompt', async () => {
			const optimizer = optimizerRepo.create({
				systemPrompt: '',
			});
			const saved = await optimizerRepo.save(optimizer);

			const found = await optimizerRepo.findOne({
				where: { id: saved.id },
			});
			expect(found!.systemPrompt).toBe('');
		});

		it('should handle systemPrompt with special characters', async () => {
			const specialPrompt =
				'Test with "quotes", \'apostrophes\', \n newlines, \t tabs, and emojis: 🎨';
			const optimizer = optimizerRepo.create({
				systemPrompt: specialPrompt,
			});
			const saved = await optimizerRepo.save(optimizer);

			const found = await optimizerRepo.findOne({
				where: { id: saved.id },
			});
			expect(found!.systemPrompt).toBe(specialPrompt);
		});
	});
});
