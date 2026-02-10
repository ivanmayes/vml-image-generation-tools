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
import { Project } from '../../src/project/project.entity';

describe('Project CRUD (E2E Real)', () => {
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
		logger = new TestLogger('Project CRUD');
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

	describe('POST /organization/:orgId/projects — Create Project', () => {
		it('should create project with valid DTO', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const dto = { name: 'Test Project', description: 'A test project' };

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/projects`)
				.auth(token)
				.send(dto)
				.expect(201);

			logger.logAssertion('response.status === 201', res.status === 201);
			expect(res.status).toBe(201);
			expect(res.body.data.name).toBe('Test Project');
			expect(res.body.data.id).toBeDefined();

			// Verify in DB
			const dbProject = await dataSource
				.getRepository(Project)
				.findOneBy({ id: res.body.data.id });
			logger.logAssertion('DB record exists', !!dbProject);
			expect(dbProject).toBeDefined();
			expect(dbProject!.organizationId).toBe(org.id);
		});

		it('should return 400 for missing name', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/projects`)
				.auth(token)
				.send({ description: 'No name' })
				.expect(400);

			logger.logAssertion('missing name returns 400', res.status === 400);
			expect(res.status).toBe(400);
		});

		it('should return 401 without auth', async () => {
			const org = await createOrganization(dataSource);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/projects`)
				.send({ name: 'Test' })
				.expect(401);

			logger.logAssertion('no auth returns 401', res.status === 401);
			expect(res.status).toBe(401);
		});
	});

	describe('GET /organization/:orgId/projects — List Projects', () => {
		it('should list projects for organization', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			await createProject(dataSource, org.id!, { name: 'Project A' });
			await createProject(dataSource, org.id!, { name: 'Project B' });

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/projects`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'body.data has 2 projects',
				res.body.data?.length === 2,
			);
			expect(res.body.data).toHaveLength(2);
		});

		it('should scope projects to organization', async () => {
			const org1 = await createOrganization(dataSource);
			const org2 = await createOrganization(dataSource);
			const user1 = await createUser(dataSource, org1.id!);
			const token1 = await getAuthToken(dataSource, user1);

			await createProject(dataSource, org1.id!, { name: 'Org1 Project' });
			await createProject(dataSource, org2.id!, { name: 'Org2 Project' });

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org1.id}/projects`)
				.auth(token1)
				.expect(200);

			logger.logAssertion(
				'only org1 projects returned',
				res.body.data?.length === 1,
			);
			expect(res.body.data).toHaveLength(1);
			expect(res.body.data[0].name).toBe('Org1 Project');
		});
	});

	describe('GET /organization/:orgId/projects/:id — Get Single Project', () => {
		it('should return project by ID', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const project = await createProject(dataSource, org.id!, {
				name: 'My Project',
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/projects/${project.id}`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'body.data.id matches',
				res.body.data?.id === project.id,
			);
			expect(res.body.data.id).toBe(project.id);
			expect(res.body.data.name).toBe('My Project');
		});

		it('should return 404 for non-existent project', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/projects/00000000-0000-4000-8000-000000000099`,
				)
				.auth(token)
				.expect(404);

			logger.logAssertion(
				'non-existent project returns 404',
				res.status === 404,
			);
			expect(res.status).toBe(404);
		});
	});

	describe('PUT /organization/:orgId/projects/:id — Update Project', () => {
		it('should update project name', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const project = await createProject(dataSource, org.id!, {
				createdBy: user.id!,
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.put(`/organization/${org.id}/projects/${project.id}`)
				.auth(token)
				.send({ name: 'Updated Project' })
				.expect(200);

			logger.logAssertion('update returns 200', res.status === 200);
			expect(res.status).toBe(200);
			expect(res.body.data.name).toBe('Updated Project');
		});
	});

	describe('DELETE /organization/:orgId/projects/:id — Delete Project', () => {
		it('should soft delete project', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const project = await createProject(dataSource, org.id!, {
				createdBy: user.id!,
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.delete(`/organization/${org.id}/projects/${project.id}`)
				.auth(token)
				.expect(200);

			logger.logAssertion('delete returns 200', res.status === 200);
			expect(res.status).toBe(200);
			expect(res.body.message).toContain('deleted');
		});

		it('should return 404 for non-existent project delete', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.delete(
					`/organization/${org.id}/projects/00000000-0000-4000-8000-000000000099`,
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
});
