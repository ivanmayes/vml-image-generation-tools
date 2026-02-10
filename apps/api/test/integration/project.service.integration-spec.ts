import { DataSource, Repository } from 'typeorm';

import { Project } from '../../src/project/project.entity';
import { ProjectService } from '../../src/project/project.service';
import { UserRole } from '../../src/user/user-role.enum';
import { UserContext } from '../../src/_core/interfaces/user-context.interface';
import { TestDatabaseManager } from '../test-database.config';
import { createOrganization, createUser, createProject } from '../factories';

/**
 * ProjectService Integration Tests
 *
 * Tests hit a REAL PostgreSQL database. Zero mocks.
 */
describe('ProjectService (Integration)', () => {
	let dbManager: TestDatabaseManager;
	let ds: DataSource;
	let projectService: ProjectService;
	let projectRepo: Repository<Project>;

	beforeAll(async () => {
		console.log('[ProjectService] Initializing test database...');
		dbManager = new TestDatabaseManager();
		ds = await dbManager.initialize();
		console.log('[ProjectService] DB connected.');

		projectRepo = ds.getRepository(Project);
		projectService = new ProjectService(projectRepo);
	});

	beforeEach(async () => {
		console.log('[ProjectService] Truncating tables...');
		await dbManager.reset();
	});

	afterAll(async () => {
		console.log('[ProjectService] Closing database connection...');
		await dbManager.destroy();
	});

	// ── create() ──────────────────────────────────────────────────────────────

	describe('create()', () => {
		it('should create a project with all fields', async () => {
			const org = await createOrganization(ds);

			const project = await projectService.create({
				organizationId: org.id,
				name: 'Brand Campaign',
				description: 'Q1 brand campaign assets',
				settings: { aspectRatio: '16:9' },
			});

			expect(project.id).toBeDefined();
			expect(project.name).toBe('Brand Campaign');
			expect(project.description).toBe('Q1 brand campaign assets');
			expect(project.settings).toEqual({ aspectRatio: '16:9' });

			const found = await projectRepo.findOne({
				where: { id: project.id },
			});
			expect(found).not.toBeNull();
		});
	});

	// ── findByOrganization() ──────────────────────────────────────────────────

	describe('findByOrganization()', () => {
		it('should return projects for a specific org', async () => {
			const org = await createOrganization(ds);
			await createProject(ds, org.id, { name: 'Project A' });
			await createProject(ds, org.id, { name: 'Project B' });

			const projects = await projectService.findByOrganization(org.id);

			expect(projects).toHaveLength(2);
		});

		it('should scope by userContext for non-admin users', async () => {
			const org = await createOrganization(ds);
			const user1 = await createUser(ds, org.id, { role: UserRole.User });
			const user2 = await createUser(ds, org.id, { role: UserRole.User });

			await createProject(ds, org.id, {
				name: 'User1 Project',
				createdBy: user1.id!,
			});
			await createProject(ds, org.id, {
				name: 'User2 Project',
				createdBy: user2.id!,
			});

			const ctx: UserContext = { userId: user1.id!, role: UserRole.User };
			const projects = await projectService.findByOrganization(
				org.id,
				undefined,
				50,
				0,
				ctx,
			);

			expect(projects).toHaveLength(1);
			expect(projects[0].name).toBe('User1 Project');
		});

		it('should exclude soft-deleted projects', async () => {
			const org = await createOrganization(ds);
			const project = await createProject(ds, org.id, {
				name: 'ToDelete',
			});
			await createProject(ds, org.id, { name: 'Active' });

			await projectService.softDelete(project.id, org.id);

			const projects = await projectService.findByOrganization(org.id);
			expect(projects).toHaveLength(1);
			expect(projects[0].name).toBe('Active');
		});
	});

	// ── findOne() ─────────────────────────────────────────────────────────────

	describe('findOne()', () => {
		it('should find project by ID and org', async () => {
			const org = await createOrganization(ds);
			const project = await createProject(ds, org.id, { name: 'FindMe' });

			const found = await projectService.findOne(project.id, org.id);
			expect(found).not.toBeNull();
			expect(found!.name).toBe('FindMe');
		});

		it('should return null for project in different org', async () => {
			const org1 = await createOrganization(ds);
			const org2 = await createOrganization(ds);
			const project = await createProject(ds, org1.id);

			const found = await projectService.findOne(project.id, org2.id);
			expect(found).toBeNull();
		});
	});

	// ── update() ──────────────────────────────────────────────────────────────

	describe('update()', () => {
		it('should update project fields', async () => {
			const org = await createOrganization(ds);
			const project = await createProject(ds, org.id, { name: 'Before' });

			const updated = await projectService.update(project.id, org.id, {
				name: 'After',
			});

			expect(updated.name).toBe('After');
		});

		it('should throw for non-existent project', async () => {
			const org = await createOrganization(ds);

			await expect(
				projectService.update(
					'00000000-0000-4000-8000-000000000099',
					org.id,
					{ name: 'X' },
				),
			).rejects.toThrow('not found');
		});
	});

	// ── softDelete() ──────────────────────────────────────────────────────────

	describe('softDelete()', () => {
		it('should soft-delete a project', async () => {
			const org = await createOrganization(ds);
			const project = await createProject(ds, org.id);

			await projectService.softDelete(project.id, org.id);

			// Not found without withDeleted
			const found = await projectRepo.findOne({
				where: { id: project.id },
			});
			expect(found).toBeNull();

			// Found with withDeleted
			const deleted = await projectRepo.findOne({
				where: { id: project.id },
				withDeleted: true,
			});
			expect(deleted).not.toBeNull();
			expect(deleted!.deletedAt).not.toBeNull();
		});

		it('should throw for project in different org', async () => {
			const org1 = await createOrganization(ds);
			const org2 = await createOrganization(ds);
			const project = await createProject(ds, org1.id);

			await expect(
				projectService.softDelete(project.id, org2.id),
			).rejects.toThrow('not found');
		});
	});

	// ── Cross-org isolation ───────────────────────────────────────────────────

	describe('Cross-org isolation', () => {
		it('should isolate projects between organizations', async () => {
			const org1 = await createOrganization(ds);
			const org2 = await createOrganization(ds);
			await createProject(ds, org1.id, { name: 'Org1 Project' });
			await createProject(ds, org2.id, { name: 'Org2 Project' });

			const org1Projects = await projectService.findByOrganization(
				org1.id,
			);
			const org2Projects = await projectService.findByOrganization(
				org2.id,
			);

			expect(org1Projects).toHaveLength(1);
			expect(org1Projects[0].name).toBe('Org1 Project');
			expect(org2Projects).toHaveLength(1);
			expect(org2Projects[0].name).toBe('Org2 Project');
		});
	});
});
