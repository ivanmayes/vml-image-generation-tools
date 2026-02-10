import { DataSource, Repository } from 'typeorm';

import { Organization } from '../../src/organization/organization.entity';
import { OrganizationService } from '../../src/organization/organization.service';
import { TestDatabaseManager } from '../test-database.config';
import { createOrganization } from '../factories';

/**
 * OrganizationService Integration Tests
 *
 * Tests hit a REAL PostgreSQL database. Zero mocks.
 */
describe('OrganizationService (Integration)', () => {
	let dbManager: TestDatabaseManager;
	let ds: DataSource;
	let orgService: OrganizationService;
	let orgRepo: Repository<Organization>;

	beforeAll(async () => {
		console.log('[OrganizationService] Initializing test database...');
		dbManager = new TestDatabaseManager();
		ds = await dbManager.initialize();
		console.log('[OrganizationService] DB connected.');

		orgRepo = ds.getRepository(Organization);
		orgService = new OrganizationService(orgRepo, ds);
	});

	beforeEach(async () => {
		console.log('[OrganizationService] Truncating tables...');
		await dbManager.reset();
	});

	afterAll(async () => {
		console.log('[OrganizationService] Closing database connection...');
		await dbManager.destroy();
	});

	// ── save() ────────────────────────────────────────────────────────────────

	describe('save()', () => {
		it('should create and persist an organization', async () => {
			const org = await orgService.save({
				name: 'Test Corp',
				slug: `test-corp-${Date.now()}`,
				enabled: true,
				redirectToSpace: false,
			});

			expect(org.id).toBeDefined();
			expect(org.name).toBe('Test Corp');
			expect(org.enabled).toBe(true);

			// Verify in DB
			const found = await orgRepo.findOne({ where: { id: org.id } });
			expect(found).not.toBeNull();
			expect(found!.name).toBe('Test Corp');
		});

		it('should save with settings', async () => {
			const org = await orgService.save({
				name: 'Settings Corp',
				slug: `settings-corp-${Date.now()}`,
				enabled: true,
				redirectToSpace: false,
				settings: { entities: {} },
			});

			expect(org.settings).toBeDefined();
			expect(org.settings).toHaveProperty('entities');
		});
	});

	// ── findOne() ─────────────────────────────────────────────────────────────

	describe('findOne()', () => {
		it('should find organization by ID', async () => {
			const org = await createOrganization(ds, { name: 'FindMe Corp' });

			const found = await orgService.findOne({ where: { id: org.id } });

			expect(found).not.toBeNull();
			expect(found!.name).toBe('FindMe Corp');
		});

		it('should return null for non-existent organization', async () => {
			const found = await orgService.findOne({
				where: { id: '00000000-0000-4000-8000-000000000099' },
			});

			expect(found).toBeNull();
		});
	});

	// ── updateOne() ───────────────────────────────────────────────────────────

	describe('updateOne()', () => {
		it('should update organization fields', async () => {
			const org = await createOrganization(ds, { name: 'Original Name' });

			org.name = 'Updated Name';
			const updated = await orgService.updateOne(org);

			expect(updated.name).toBe('Updated Name');

			// Verify in DB
			const found = await orgRepo.findOne({ where: { id: org.id } });
			expect(found!.name).toBe('Updated Name');
		});

		it('should update settings', async () => {
			const org = await createOrganization(ds);

			org.settings = { entities: {} } as any;
			await orgService.updateOne(org);

			const found = await orgRepo.findOne({ where: { id: org.id } });
			expect(found!.settings).toBeDefined();
			expect(found!.settings).toHaveProperty('entities');
		});
	});

	// ── getOrganization() ─────────────────────────────────────────────────────

	describe('getOrganization()', () => {
		it('should get organization by ID', async () => {
			const org = await createOrganization(ds, { name: 'Get Corp' });

			const found = await orgService.getOrganization(org.id);

			expect(found).not.toBeNull();
			expect(found!.name).toBe('Get Corp');
		});

		it('should filter by enabled when enabledOnly is true', async () => {
			const enabled = await createOrganization(ds, {
				name: 'Enabled',
				enabled: true,
			});
			const disabled = await createOrganization(ds, {
				name: 'Disabled',
				enabled: false,
			});

			const foundEnabled = await orgService.getOrganization(
				enabled.id,
				true,
			);
			expect(foundEnabled).not.toBeNull();
			expect(foundEnabled!.name).toBe('Enabled');

			const foundDisabled = await orgService.getOrganization(
				disabled.id,
				true,
			);
			expect(foundDisabled).toBeNull();
		});
	});

	// ── find() ────────────────────────────────────────────────────────────────

	describe('find()', () => {
		it('should return all organizations', async () => {
			await createOrganization(ds, { name: 'Org A' });
			await createOrganization(ds, { name: 'Org B' });

			const orgs = await orgService.find();

			expect(orgs).toHaveLength(2);
			const names = orgs.map((o) => o.name);
			expect(names).toContain('Org A');
			expect(names).toContain('Org B');
		});
	});

	// ── Slug uniqueness ───────────────────────────────────────────────────────

	describe('Slug uniqueness', () => {
		it('should enforce unique slugs', async () => {
			const slug = `unique-slug-${Date.now()}`;
			await createOrganization(ds, { slug });

			await expect(
				orgService.save({
					name: 'Duplicate',
					slug,
					enabled: true,
					redirectToSpace: false,
				}),
			).rejects.toThrow();
		});
	});
});
