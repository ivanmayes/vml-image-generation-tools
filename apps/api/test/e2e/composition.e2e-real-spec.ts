import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
	createTestApp,
	TestLogger,
	createTestRequest,
	getAuthToken,
	setTestJwtEnv,
} from '../helpers';
import { createOrganization, createUser, createProject } from '../factories';
import { TestDatabaseManager } from '../test-database.config';
import { Composition } from '../../src/composition/entities/composition.entity';
import { CompositionVersion } from '../../src/composition/entities/composition-version.entity';
import { CompositionVersionMode } from '../../src/composition/dtos/create-composition-version.dto';

/** Insert a composition directly into the DB for read-only tests. */
async function createComposition(
	dataSource: DataSource,
	orgId: string,
	overrides: Partial<Composition> = {},
): Promise<Composition> {
	const repo = dataSource.getRepository(Composition);
	const composition = repo.create({
		organizationId: orgId,
		name: overrides.name ?? `Composition ${Date.now()}`,
		canvasWidth: 1024,
		canvasHeight: 1024,
		...overrides,
	});
	return repo.save(composition);
}

describe('Composition CRUD (E2E Real)', () => {
	let app: INestApplication;
	let dataSource: DataSource;
	let dbManager: TestDatabaseManager;
	let logger: TestLogger;

	beforeAll(async () => {
		setTestJwtEnv();
		dbManager = new TestDatabaseManager();
		await dbManager.initialize();

		const result = await createTestApp();
		app = result.app;
		dataSource = result.dataSource;
		logger = new TestLogger('Composition CRUD');
	});

	afterAll(async () => {
		logger.endSuite();
		logger.flush();
		await app.close();
		await dbManager.destroy();
	});

	beforeEach(async () => {
		await dbManager.reset();
		logger.startTest(expect.getState().currentTestName ?? 'unknown');
	});

	afterEach(() => {
		logger.endTest(true);
	});

	// ─── CREATE ─────────────────────────────────────────────────────────────────

	describe('POST /organization/:orgId/compositions — Create Composition', () => {
		it('should create composition with valid DTO', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const dto = { name: 'Test Composition' };

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/compositions`)
				.auth(token)
				.send(dto)
				.expect(201);

			logger.logAssertion('response.status === 201', res.status === 201);
			expect(res.status).toBe(201);
			expect(res.body.data.name).toBe('Test Composition');
			expect(res.body.data.id).toBeDefined();
			expect(res.body.data.canvasWidth).toBe(1024);
			expect(res.body.data.canvasHeight).toBe(1024);
		});

		it('should create composition with custom dimensions', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const dto = {
				name: 'Custom Canvas',
				canvasWidth: 2048,
				canvasHeight: 1536,
			};

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/compositions`)
				.auth(token)
				.send(dto)
				.expect(201);

			logger.logAssertion('response.status === 201', res.status === 201);
			expect(res.body.data.canvasWidth).toBe(2048);
			expect(res.body.data.canvasHeight).toBe(1536);
		});

		it('should create composition linked to project', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const project = await createProject(dataSource, org.id!);

			const dto = { name: 'Linked Composition', projectId: project.id };

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/compositions`)
				.auth(token)
				.send(dto)
				.expect(201);

			logger.logAssertion(
				'projectId set',
				res.body.data.projectId === project.id,
			);
			expect(res.body.data.projectId).toBe(project.id);
		});

		it('should return 400 for missing name', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/compositions`)
				.auth(token)
				.send({ canvasWidth: 512 })
				.expect(400);

			logger.logAssertion('missing name returns 400', res.status === 400);
			expect(res.status).toBe(400);
		});

		it('should return 400 for invalid canvasWidth (> 4096)', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/compositions`)
				.auth(token)
				.send({ name: 'Too wide', canvasWidth: 5000 })
				.expect(400);

			logger.logAssertion(
				'oversized canvas returns 400',
				res.status === 400,
			);
			expect(res.status).toBe(400);
		});

		it('should return 401 without auth', async () => {
			const org = await createOrganization(dataSource);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/compositions`)
				.send({ name: 'No Auth' })
				.expect(401);

			logger.logAssertion('no auth returns 401', res.status === 401);
			expect(res.status).toBe(401);
		});
	});

	// ─── LIST ───────────────────────────────────────────────────────────────────

	describe('GET /organization/:orgId/compositions — List Compositions', () => {
		it('should list compositions for organization', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			await createComposition(dataSource, org.id!, { name: 'Comp A' });
			await createComposition(dataSource, org.id!, { name: 'Comp B' });

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/compositions`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'body.data.data has 2 compositions',
				res.body.data?.data?.length === 2,
			);
			expect(res.body.data.data).toHaveLength(2);
			expect(res.body.data.total).toBe(2);
		});

		it('should return empty for org with no compositions', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/compositions`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'empty data',
				res.body.data?.data?.length === 0,
			);
			expect(res.body.data.data).toEqual([]);
			expect(res.body.data.total).toBe(0);
		});

		it('should scope compositions to organization (cross-org isolation)', async () => {
			const org1 = await createOrganization(dataSource);
			const org2 = await createOrganization(dataSource);
			const user1 = await createUser(dataSource, org1.id!);
			const token1 = await getAuthToken(dataSource, user1);

			await createComposition(dataSource, org1.id!, {
				name: 'Org1 Comp',
			});
			await createComposition(dataSource, org2.id!, {
				name: 'Org2 Comp',
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org1.id}/compositions`)
				.auth(token1)
				.expect(200);

			logger.logAssertion(
				'only org1 compositions returned',
				res.body.data?.data?.length === 1,
			);
			expect(res.body.data.data).toHaveLength(1);
			expect(res.body.data.data[0].name).toBe('Org1 Comp');
		});

		it('should filter by projectId', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const project = await createProject(dataSource, org.id!);

			await createComposition(dataSource, org.id!, {
				name: 'In Project',
				projectId: project.id,
			});
			await createComposition(dataSource, org.id!, {
				name: 'No Project',
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/compositions?projectId=${project.id}`,
				)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'filtered to 1 composition',
				res.body.data?.data?.length === 1,
			);
			expect(res.body.data.data).toHaveLength(1);
			expect(res.body.data.data[0].name).toBe('In Project');
		});

		it('should return 400 for invalid projectId UUID', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/compositions?projectId=not-a-uuid`,
				)
				.auth(token)
				.expect(400);

			logger.logAssertion(
				'invalid projectId returns 400',
				res.status === 400,
			);
			expect(res.status).toBe(400);
		});
	});

	// ─── GET ONE ────────────────────────────────────────────────────────────────

	describe('GET /organization/:orgId/compositions/:id — Get Composition', () => {
		it('should return composition by ID', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const comp = await createComposition(dataSource, org.id!, {
				name: 'Fetch Me',
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/compositions/${comp.id}`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'body.data.id matches',
				res.body.data?.id === comp.id,
			);
			expect(res.body.data.id).toBe(comp.id);
			expect(res.body.data.name).toBe('Fetch Me');
		});

		it('should return 404 for non-existent composition', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/compositions/00000000-0000-4000-8000-000000000099`,
				)
				.auth(token)
				.expect(404);

			logger.logAssertion(
				'non-existent composition returns 404',
				res.status === 404,
			);
			expect(res.status).toBe(404);
		});
	});

	// ─── UPDATE (PATCH) ─────────────────────────────────────────────────────────

	describe('PATCH /organization/:orgId/compositions/:id — Update Composition', () => {
		it('should update composition name', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const comp = await createComposition(dataSource, org.id!, {
				name: 'Old Name',
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.patch(`/organization/${org.id}/compositions/${comp.id}`)
				.auth(token)
				.send({ name: 'New Name' })
				.expect(200);

			logger.logAssertion('update returns 200', res.status === 200);
			expect(res.body.data.name).toBe('New Name');
		});

		it('should update canvas dimensions', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const comp = await createComposition(dataSource, org.id!);

			const req = createTestRequest(app, logger);
			const res = await req
				.patch(`/organization/${org.id}/compositions/${comp.id}`)
				.auth(token)
				.send({ canvasWidth: 512, canvasHeight: 768 })
				.expect(200);

			logger.logAssertion('dimensions updated', res.status === 200);
			expect(res.body.data.canvasWidth).toBe(512);
			expect(res.body.data.canvasHeight).toBe(768);
		});

		it('should update canvasState', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const comp = await createComposition(dataSource, org.id!);

			const canvasState = {
				version: '5.3.0',
				objects: [{ type: 'rect', left: 10, top: 10 }],
			};

			const req = createTestRequest(app, logger);
			const res = await req
				.patch(`/organization/${org.id}/compositions/${comp.id}`)
				.auth(token)
				.send({ canvasState })
				.expect(200);

			logger.logAssertion('canvasState updated', res.status === 200);
			expect(res.body.data.canvasState).toEqual(canvasState);
		});

		it('should return 404 for non-existent composition update', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.patch(
					`/organization/${org.id}/compositions/00000000-0000-4000-8000-000000000099`,
				)
				.auth(token)
				.send({ name: 'Ghost' })
				.expect(404);

			logger.logAssertion(
				'non-existent update returns 404',
				res.status === 404,
			);
			expect(res.status).toBe(404);
		});
	});

	// ─── DELETE ──────────────────────────────────────────────────────────────────

	describe('DELETE /organization/:orgId/compositions/:id — Delete Composition', () => {
		it('should soft delete composition', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const comp = await createComposition(dataSource, org.id!);

			const req = createTestRequest(app, logger);
			const res = await req
				.delete(`/organization/${org.id}/compositions/${comp.id}`)
				.auth(token)
				.expect(200);

			logger.logAssertion('delete returns 200', res.status === 200);
			expect(res.body.message).toContain('deleted');

			// Verify soft-deleted in DB (withDeleted to find it)
			const dbComp = await dataSource
				.getRepository(Composition)
				.findOne({ where: { id: comp.id }, withDeleted: true });
			logger.logAssertion('DB record soft deleted', !!dbComp?.deletedAt);
			expect(dbComp!.deletedAt).toBeDefined();
		});

		it('should return 404 for non-existent composition delete', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.delete(
					`/organization/${org.id}/compositions/00000000-0000-4000-8000-000000000099`,
				)
				.auth(token)
				.expect(404);

			logger.logAssertion(
				'non-existent delete returns 404',
				res.status === 404,
			);
			expect(res.status).toBe(404);
		});
	});

	// ─── SIGNED URL ─────────────────────────────────────────────────────────────

	describe('GET /organization/:orgId/compositions/signed-url — Signed URL', () => {
		it('should return 400 for missing key', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/compositions/signed-url`)
				.auth(token)
				.expect(400);

			logger.logAssertion('missing key returns 400', res.status === 400);
			expect(res.status).toBe(400);
		});

		it('should return 400 for key with wrong org prefix', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/compositions/signed-url?key=compositions/other-org/file.jpg`,
				)
				.auth(token)
				.expect(400);

			logger.logAssertion(
				'wrong org prefix returns 400',
				res.status === 400,
			);
			expect(res.status).toBe(400);
		});

		it('should return 400 for path traversal attempt', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/compositions/signed-url?key=compositions/${org.id}/../../../etc/passwd`,
				)
				.auth(token)
				.expect(400);

			logger.logAssertion(
				'path traversal returns 400',
				res.status === 400,
			);
			expect(res.status).toBe(400);
		});
	});

	// ─── VERSIONS ───────────────────────────────────────────────────────────────

	describe('POST /organization/:orgId/compositions/:id/versions — Create Version', () => {
		it('should create a version with upload mode', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const comp = await createComposition(dataSource, org.id!);

			// Upload mode requires backgroundImage (base64-encoded image data)
			const dto = {
				mode: CompositionVersionMode.UPLOAD,
				prompt: 'Test upload',
				backgroundImage:
					'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
			};

			const req = createTestRequest(app, logger);
			const res = await req
				.post(
					`/organization/${org.id}/compositions/${comp.id}/versions`,
				)
				.auth(token)
				.send(dto)
				.expect(201);

			logger.logAssertion('version created', res.status === 201);
			expect(res.body.data.compositionId).toBe(comp.id);
			expect(res.body.data.versionNumber).toBeDefined();
			expect(res.body.data.prompt).toBe('Test upload');
		});

		it('should return 400 for missing mode', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const comp = await createComposition(dataSource, org.id!);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(
					`/organization/${org.id}/compositions/${comp.id}/versions`,
				)
				.auth(token)
				.send({ prompt: 'No mode' })
				.expect(400);

			logger.logAssertion('missing mode returns 400', res.status === 400);
			expect(res.status).toBe(400);
		});

		it('should return 404 for non-existent composition', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			// Must include backgroundImage to pass service-level validation
			// so the composition lookup can return 404
			const req = createTestRequest(app, logger);
			const res = await req
				.post(
					`/organization/${org.id}/compositions/00000000-0000-4000-8000-000000000099/versions`,
				)
				.auth(token)
				.send({
					mode: CompositionVersionMode.UPLOAD,
					backgroundImage:
						'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
				})
				.expect(404);

			logger.logAssertion(
				'non-existent comp version create 404',
				res.status === 404,
			);
			expect(res.status).toBe(404);
		});
	});

	describe('GET /organization/:orgId/compositions/:id/versions — List Versions', () => {
		it('should list versions for a composition', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const comp = await createComposition(dataSource, org.id!);

			// Create versions directly in DB
			const versionRepo = dataSource.getRepository(CompositionVersion);
			await versionRepo.save(
				versionRepo.create({
					compositionId: comp.id,
					versionNumber: 1,
					prompt: 'v1',
				}),
			);
			await versionRepo.save(
				versionRepo.create({
					compositionId: comp.id,
					versionNumber: 2,
					prompt: 'v2',
				}),
			);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/compositions/${comp.id}/versions`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'2 versions returned',
				res.body.data?.data?.length === 2,
			);
			expect(res.body.data.data).toHaveLength(2);
			expect(res.body.data.total).toBe(2);
		});

		it('should return 404 for versions of non-existent composition', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/compositions/00000000-0000-4000-8000-000000000099/versions`,
				)
				.auth(token)
				.expect(404);

			logger.logAssertion(
				'non-existent comp versions 404',
				res.status === 404,
			);
			expect(res.status).toBe(404);
		});
	});

	describe('GET /organization/:orgId/compositions/:id/versions/:versionId — Get Version', () => {
		it('should return a specific version', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const comp = await createComposition(dataSource, org.id!);

			const versionRepo = dataSource.getRepository(CompositionVersion);
			const version = await versionRepo.save(
				versionRepo.create({
					compositionId: comp.id,
					versionNumber: 1,
					prompt: 'Specific version',
				}),
			);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/compositions/${comp.id}/versions/${version.id}`,
				)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'version returned',
				res.body.data?.id === version.id,
			);
			expect(res.body.data.id).toBe(version.id);
			expect(res.body.data.prompt).toBe('Specific version');
		});

		it('should return 404 for non-existent version', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const comp = await createComposition(dataSource, org.id!);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/compositions/${comp.id}/versions/00000000-0000-4000-8000-000000000099`,
				)
				.auth(token)
				.expect(404);

			logger.logAssertion('non-existent version 404', res.status === 404);
			expect(res.status).toBe(404);
		});
	});

	// ─── CROSS-ORG ISOLATION ────────────────────────────────────────────────────

	describe('Cross-Organization Isolation', () => {
		it('should deny cross-org composition access (403)', async () => {
			const org1 = await createOrganization(dataSource);
			const org2 = await createOrganization(dataSource);
			const user1 = await createUser(dataSource, org1.id!);
			const token1 = await getAuthToken(dataSource, user1);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org2.id}/compositions`)
				.auth(token1)
				.send({ name: 'Cross Org' })
				.expect(403);

			logger.logAssertion(
				'cross-org create returns 403',
				res.status === 403,
			);
			expect(res.status).toBe(403);
		});

		it('should deny cross-org composition read (403)', async () => {
			const org1 = await createOrganization(dataSource);
			const org2 = await createOrganization(dataSource);
			const user1 = await createUser(dataSource, org1.id!);
			const token1 = await getAuthToken(dataSource, user1);
			const comp = await createComposition(dataSource, org2.id!);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org2.id}/compositions/${comp.id}`)
				.auth(token1)
				.expect(403);

			logger.logAssertion(
				'cross-org read returns 403',
				res.status === 403,
			);
			expect(res.status).toBe(403);
		});
	});
});
