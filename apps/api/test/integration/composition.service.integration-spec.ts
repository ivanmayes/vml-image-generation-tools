import { DataSource, Repository } from 'typeorm';

import { Composition } from '../../src/composition/entities/composition.entity';
import {
	CompositionVersion,
	CompositionVersionStatus,
} from '../../src/composition/entities/composition-version.entity';
import { TestDatabaseManager } from '../test-database.config';
import { createOrganization, createProject } from '../factories';

/**
 * CompositionService Integration Tests (Repository-level)
 *
 * Tests hit a REAL PostgreSQL database. Zero mocks.
 *
 * Note: CompositionService depends on GeminiImageService, DebugOutputService, and S3
 * for the createVersion flow which processes images. We test the CRUD and version
 * numbering logic directly via repositories here. The full processVersion flow
 * with image generation belongs in E2E tests.
 */
describe('CompositionService (Integration)', () => {
	let dbManager: TestDatabaseManager;
	let ds: DataSource;
	let compositionRepo: Repository<Composition>;
	let versionRepo: Repository<CompositionVersion>;

	beforeAll(async () => {
		console.log('[CompositionService] Initializing test database...');
		dbManager = new TestDatabaseManager();
		ds = await dbManager.initialize();
		console.log('[CompositionService] DB connected.');

		compositionRepo = ds.getRepository(Composition);
		versionRepo = ds.getRepository(CompositionVersion);
	});

	beforeEach(async () => {
		console.log('[CompositionService] Truncating tables...');
		await dbManager.reset();
	});

	afterAll(async () => {
		console.log('[CompositionService] Closing database connection...');
		await dbManager.destroy();
	});

	// Helper to create a composition directly
	async function createComposition(
		orgId: string,
		overrides: Partial<Composition> = {},
	): Promise<Composition> {
		const comp = compositionRepo.create({
			organizationId: orgId,
			name: `Test Composition ${Date.now()}`,
			canvasWidth: 1024,
			canvasHeight: 1024,
			...overrides,
		});
		return compositionRepo.save(comp);
	}

	// ── Composition CRUD ──────────────────────────────────────────────────────

	describe('Composition CRUD', () => {
		it('should create a composition', async () => {
			const org = await createOrganization(ds);

			const comp = await createComposition(org.id, {
				name: 'Hero Banner',
				canvasWidth: 1920,
				canvasHeight: 1080,
			});

			expect(comp.id).toBeDefined();
			expect(comp.name).toBe('Hero Banner');
			expect(comp.canvasWidth).toBe(1920);
			expect(comp.canvasHeight).toBe(1080);
			expect(comp.organizationId).toBe(org.id);
		});

		it('should create composition with project reference', async () => {
			const org = await createOrganization(ds);
			const project = await createProject(ds, org.id);

			const comp = await createComposition(org.id, {
				projectId: project.id,
			});

			expect(comp.projectId).toBe(project.id);
		});

		it('should find compositions by organization', async () => {
			const org = await createOrganization(ds);
			await createComposition(org.id, { name: 'Comp A' });
			await createComposition(org.id, { name: 'Comp B' });

			const comps = await compositionRepo.find({
				where: { organizationId: org.id },
			});

			expect(comps).toHaveLength(2);
		});

		it('should update a composition', async () => {
			const org = await createOrganization(ds);
			const comp = await createComposition(org.id, { name: 'Before' });

			comp.name = 'After';
			const updated = await compositionRepo.save(comp);

			expect(updated.name).toBe('After');
		});

		it('should soft-delete a composition', async () => {
			const org = await createOrganization(ds);
			const comp = await createComposition(org.id);

			await compositionRepo.softRemove(comp);

			const found = await compositionRepo.findOne({
				where: { id: comp.id },
			});
			expect(found).toBeNull();

			const deleted = await compositionRepo.findOne({
				where: { id: comp.id },
				withDeleted: true,
			});
			expect(deleted).not.toBeNull();
			expect(deleted!.deletedAt).not.toBeNull();
		});

		it('should store and retrieve canvasState as JSONB', async () => {
			const org = await createOrganization(ds);
			const canvasState = {
				version: '5.3.0',
				objects: [
					{ type: 'rect', left: 0, top: 0, width: 100, height: 100 },
					{ type: 'text', text: 'Hello', left: 50, top: 50 },
				],
			};

			const comp = await createComposition(org.id, {
				canvasState: canvasState as any,
			});

			const found = await compositionRepo.findOne({
				where: { id: comp.id },
			});
			expect(found!.canvasState).toBeDefined();
			expect(found!.canvasState!.version).toBe('5.3.0');
			expect(found!.canvasState!.objects).toHaveLength(2);
		});
	});

	// ── Version management ────────────────────────────────────────────────────

	describe('Version management', () => {
		it('should create versions with incrementing version numbers', async () => {
			const org = await createOrganization(ds);
			const comp = await createComposition(org.id);

			const v1 = versionRepo.create({
				compositionId: comp.id,
				versionNumber: 1,
				prompt: 'First version prompt',
				status: CompositionVersionStatus.SUCCESS,
			});
			await versionRepo.save(v1);

			const v2 = versionRepo.create({
				compositionId: comp.id,
				versionNumber: 2,
				prompt: 'Second version prompt',
				status: CompositionVersionStatus.PROCESSING,
			});
			await versionRepo.save(v2);

			const versions = await versionRepo.find({
				where: { compositionId: comp.id },
				order: { versionNumber: 'DESC' },
			});

			expect(versions).toHaveLength(2);
			expect(versions[0].versionNumber).toBe(2);
			expect(versions[1].versionNumber).toBe(1);
		});

		it('should enforce unique compositionId + versionNumber', async () => {
			const org = await createOrganization(ds);
			const comp = await createComposition(org.id);

			const v1 = versionRepo.create({
				compositionId: comp.id,
				versionNumber: 1,
				status: CompositionVersionStatus.SUCCESS,
			});
			await versionRepo.save(v1);

			const duplicate = versionRepo.create({
				compositionId: comp.id,
				versionNumber: 1,
				status: CompositionVersionStatus.SUCCESS,
			});

			await expect(versionRepo.save(duplicate)).rejects.toThrow();
		});

		it('should find versions by composition with pagination', async () => {
			const org = await createOrganization(ds);
			const comp = await createComposition(org.id);

			for (let i = 1; i <= 5; i++) {
				const v = versionRepo.create({
					compositionId: comp.id,
					versionNumber: i,
					status: CompositionVersionStatus.SUCCESS,
				});
				await versionRepo.save(v);
			}

			const [versions, total] = await versionRepo.findAndCount({
				where: { compositionId: comp.id },
				order: { versionNumber: 'DESC' },
				take: 3,
				skip: 0,
			});

			expect(total).toBe(5);
			expect(versions).toHaveLength(3);
			expect(versions[0].versionNumber).toBe(5);
		});

		it('should store version with image metadata', async () => {
			const org = await createOrganization(ds);
			const comp = await createComposition(org.id);

			const version = versionRepo.create({
				compositionId: comp.id,
				versionNumber: 1,
				baseImageS3Key: 'compositions/test/v1.jpg',
				imageWidth: 1024,
				imageHeight: 768,
				status: CompositionVersionStatus.SUCCESS,
				prompt: 'A hero banner',
			});
			const saved = await versionRepo.save(version);

			const found = await versionRepo.findOne({
				where: { id: saved.id },
			});
			expect(found!.baseImageS3Key).toBe('compositions/test/v1.jpg');
			expect(found!.imageWidth).toBe(1024);
			expect(found!.imageHeight).toBe(768);
		});

		it('should cascade delete versions when composition is deleted', async () => {
			const org = await createOrganization(ds);
			const comp = await createComposition(org.id);

			const v = versionRepo.create({
				compositionId: comp.id,
				versionNumber: 1,
				status: CompositionVersionStatus.SUCCESS,
			});
			await versionRepo.save(v);

			// Hard delete the composition
			await compositionRepo.delete(comp.id);

			const versions = await versionRepo.find({
				where: { compositionId: comp.id },
			});
			expect(versions).toHaveLength(0);
		});
	});

	// ── Cross-org isolation ───────────────────────────────────────────────────

	describe('Cross-org isolation', () => {
		it('should isolate compositions between organizations', async () => {
			const org1 = await createOrganization(ds);
			const org2 = await createOrganization(ds);
			await createComposition(org1.id, { name: 'Org1 Comp' });
			await createComposition(org2.id, { name: 'Org2 Comp' });

			const org1Comps = await compositionRepo.find({
				where: { organizationId: org1.id },
			});
			const org2Comps = await compositionRepo.find({
				where: { organizationId: org2.id },
			});

			expect(org1Comps).toHaveLength(1);
			expect(org1Comps[0].name).toBe('Org1 Comp');
			expect(org2Comps).toHaveLength(1);
			expect(org2Comps[0].name).toBe('Org2 Comp');
		});
	});
});
