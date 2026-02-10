import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
	createTestApp,
	TestLogger,
	createTestRequest,
	getAuthToken,
	setTestJwtEnv,
} from '../helpers';
import { createOrganization, createUser, createAgent } from '../factories';
import { TestDatabaseManager } from '../test-database.config';
import { UserRole } from '../../src/user/user-role.enum';
import { Agent } from '../../src/agent/agent.entity';

describe('Agent CRUD (E2E Real)', () => {
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
		logger = new TestLogger('Agent CRUD');
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

	describe('POST /organization/:orgId/agents — Create Agent', () => {
		it('should create agent with valid minimal DTO', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const dto = {
				name: 'Test Judge',
				systemPrompt: 'You are a brand compliance judge.',
			};

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/agents`)
				.auth(token)
				.send(dto)
				.expect(201);

			logger.logAssertion('response.status === 201', res.status === 201);
			expect(res.status).toBe(201);

			logger.logAssertion(
				'body.status === "success"',
				res.body.status === 'success',
			);
			expect(res.body.status).toBe('success');

			logger.logAssertion('body.data.id is defined', !!res.body.data?.id);
			expect(res.body.data.id).toBeDefined();

			logger.logAssertion(
				'body.data.name === "Test Judge"',
				res.body.data.name === 'Test Judge',
			);
			expect(res.body.data.name).toBe('Test Judge');

			// Verify in DB
			const dbAgent = await dataSource
				.getRepository(Agent)
				.findOneBy({ id: res.body.data.id });
			logger.logAssertion('DB record exists', !!dbAgent);
			expect(dbAgent).toBeDefined();
			expect(dbAgent!.name).toBe('Test Judge');
			expect(dbAgent!.organizationId).toBe(org.id);
		});

		it('should create agent with all optional fields', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const dto = {
				name: 'Full Agent',
				systemPrompt: 'Full system prompt.',
				evaluationCategories: 'composition,lighting',
				optimizationWeight: 60,
				scoringWeight: 70,
				ragConfig: { topK: 10, similarityThreshold: 0.9 },
				canJudge: false,
				description: 'A test agent with all fields',
				capabilities: ['evaluate', 'summarize'],
				temperature: 0.8,
				maxTokens: 4096,
			};

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/agents`)
				.auth(token)
				.send(dto)
				.expect(201);

			logger.logAssertion('response.status === 201', res.status === 201);
			expect(res.status).toBe(201);
			expect(res.body.data.name).toBe('Full Agent');
			expect(res.body.data.optimizationWeight).toBe(60);
			expect(res.body.data.scoringWeight).toBe(70);
		});

		it('should return 400 for missing required name', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/agents`)
				.auth(token)
				.send({ systemPrompt: 'Only prompt' })
				.expect(400);

			logger.logAssertion('missing name returns 400', res.status === 400);
			expect(res.status).toBe(400);
		});

		it('should return 400 for missing required systemPrompt', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/agents`)
				.auth(token)
				.send({ name: 'Only name' })
				.expect(400);

			logger.logAssertion(
				'missing systemPrompt returns 400',
				res.status === 400,
			);
			expect(res.status).toBe(400);
		});

		it('should return 401 without auth', async () => {
			const org = await createOrganization(dataSource);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/agents`)
				.send({ name: 'Test', systemPrompt: 'Test' })
				.expect(401);

			logger.logAssertion('no auth returns 401', res.status === 401);
			expect(res.status).toBe(401);
		});
	});

	describe('GET /organization/:orgId/agents — List Agents', () => {
		it('should list agents for organization', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			await createAgent(dataSource, org.id!, { name: 'Agent A' });
			await createAgent(dataSource, org.id!, { name: 'Agent B' });

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.auth(token)
				.expect(200);

			logger.logAssertion('response.status === 200', res.status === 200);
			expect(res.status).toBe(200);

			logger.logAssertion(
				'body.data has 2 agents',
				res.body.data?.length === 2,
			);
			expect(res.body.data).toHaveLength(2);
		});

		it('should return empty array when no agents exist', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'empty org has empty data array',
				res.body.data?.length === 0,
			);
			expect(res.body.data).toEqual([]);
		});

		it('should scope agents to organization (cross-org isolation)', async () => {
			const org1 = await createOrganization(dataSource);
			const org2 = await createOrganization(dataSource);
			const user1 = await createUser(dataSource, org1.id!);
			const token1 = await getAuthToken(dataSource, user1);

			await createAgent(dataSource, org1.id!, { name: 'Org1 Agent' });
			await createAgent(dataSource, org2.id!, { name: 'Org2 Agent' });

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org1.id}/agents`)
				.auth(token1)
				.expect(200);

			logger.logAssertion(
				'only org1 agents returned',
				res.body.data?.length === 1,
			);
			expect(res.body.data).toHaveLength(1);
			expect(res.body.data[0].name).toBe('Org1 Agent');
		});
	});

	describe('GET /organization/:orgId/agents/:id — Get Single Agent', () => {
		it('should return agent by ID', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const agent = await createAgent(dataSource, org.id!, {
				name: 'Single Agent',
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents/${agent.id}`)
				.auth(token)
				.expect(200);

			logger.logAssertion('response.status === 200', res.status === 200);
			expect(res.status).toBe(200);

			logger.logAssertion(
				'body.data.id matches',
				res.body.data?.id === agent.id,
			);
			expect(res.body.data.id).toBe(agent.id);
			expect(res.body.data.name).toBe('Single Agent');
		});

		it('should return 404 for non-existent agent', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/agents/00000000-0000-4000-8000-000000000099`,
				)
				.auth(token)
				.expect(404);

			logger.logAssertion(
				'non-existent agent returns 404',
				res.status === 404,
			);
			expect(res.status).toBe(404);
		});
	});

	describe('PUT /organization/:orgId/agents/:id — Update Agent', () => {
		it('should update agent name', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const agent = await createAgent(dataSource, org.id!, {
				createdBy: user.id!,
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.put(`/organization/${org.id}/agents/${agent.id}`)
				.auth(token)
				.send({ name: 'Updated Name' })
				.expect(200);

			logger.logAssertion('response.status === 200', res.status === 200);
			expect(res.status).toBe(200);
			expect(res.body.data.name).toBe('Updated Name');

			// Verify in DB
			const dbAgent = await dataSource
				.getRepository(Agent)
				.findOneBy({ id: agent.id });
			logger.logAssertion(
				'DB name updated',
				dbAgent?.name === 'Updated Name',
			);
			expect(dbAgent!.name).toBe('Updated Name');
		});

		it('should return 404 for non-existent agent update', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.put(
					`/organization/${org.id}/agents/00000000-0000-4000-8000-000000000099`,
				)
				.auth(token)
				.send({ name: 'Nope' })
				.expect(404);

			logger.logAssertion(
				'non-existent update returns 404',
				res.status === 404,
			);
			expect(res.status).toBe(404);
		});

		it('should merge ragConfig on partial update', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const agent = await createAgent(dataSource, org.id!, {
				createdBy: user.id!,
				ragConfig: { topK: 5, similarityThreshold: 0.7 },
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.put(`/organization/${org.id}/agents/${agent.id}`)
				.auth(token)
				.send({ ragConfig: { topK: 10 } })
				.expect(200);

			logger.logAssertion(
				'ragConfig.topK updated to 10',
				res.body.data.ragConfig?.topK === 10,
			);
			expect(res.body.data.ragConfig.topK).toBe(10);
			// similarityThreshold should be preserved
			logger.logAssertion(
				'ragConfig.similarityThreshold preserved',
				res.body.data.ragConfig?.similarityThreshold === 0.7,
			);
			expect(res.body.data.ragConfig.similarityThreshold).toBe(0.7);
		});
	});

	describe('DELETE /organization/:orgId/agents/:id — Soft Delete', () => {
		it('should soft delete agent', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const agent = await createAgent(dataSource, org.id!, {
				createdBy: user.id!,
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.delete(`/organization/${org.id}/agents/${agent.id}`)
				.auth(token)
				.expect(200);

			logger.logAssertion('response.status === 200', res.status === 200);
			expect(res.status).toBe(200);
			expect(res.body.message).toContain('deleted');

			// Verify agent is soft-deleted (not returned in list)
			const req2 = createTestRequest(app, logger);
			const listRes = await req2
				.get(`/organization/${org.id}/agents`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'deleted agent not in list',
				listRes.body.data?.length === 0,
			);
			expect(listRes.body.data).toHaveLength(0);
		});

		it('should return 404 for non-existent agent delete', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.delete(
					`/organization/${org.id}/agents/00000000-0000-4000-8000-000000000099`,
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

	describe('Cross-Org Isolation', () => {
		it('should not allow creating agent in another org', async () => {
			const org1 = await createOrganization(dataSource);
			const org2 = await createOrganization(dataSource);
			const user = await createUser(dataSource, org1.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org2.id}/agents`)
				.auth(token)
				.send({ name: 'Cross Org', systemPrompt: 'Test' })
				.expect(403);

			logger.logAssertion(
				'cross-org create returns 403',
				res.status === 403,
			);
			expect(res.status).toBe(403);
		});

		it('should not allow deleting agent in another org', async () => {
			const org1 = await createOrganization(dataSource);
			const org2 = await createOrganization(dataSource);
			const user1 = await createUser(dataSource, org1.id!);
			const token1 = await getAuthToken(dataSource, user1);
			const agent2 = await createAgent(dataSource, org2.id!);

			const req = createTestRequest(app, logger);
			const res = await req
				.delete(`/organization/${org2.id}/agents/${agent2.id}`)
				.auth(token1)
				.expect(403);

			logger.logAssertion(
				'cross-org delete returns 403',
				res.status === 403,
			);
			expect(res.status).toBe(403);
		});
	});

	describe('Admin-Only Endpoints', () => {
		it('should allow Admin to restore a soft-deleted agent', async () => {
			const org = await createOrganization(dataSource);
			const admin = await createUser(dataSource, org.id!, {
				role: UserRole.Admin,
			});
			const token = await getAuthToken(dataSource, admin);
			const agent = await createAgent(dataSource, org.id!, {
				createdBy: admin.id!,
			});

			// Soft delete first
			await createTestRequest(app, logger)
				.delete(`/organization/${org.id}/agents/${agent.id}`)
				.auth(token)
				.expect(200);

			// Restore (NestJS @Post returns 201 by default)
			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/agents/${agent.id}/restore`)
				.auth(token)
				.expect(201);

			logger.logAssertion('restore returns 201', res.status === 201);
			expect(res.status).toBe(201);
		});

		it('should deny regular User from restoring an agent (403)', async () => {
			const org = await createOrganization(dataSource);
			const admin = await createUser(dataSource, org.id!, {
				role: UserRole.Admin,
			});
			const adminToken = await getAuthToken(dataSource, admin);
			const regularUser = await createUser(dataSource, org.id!, {
				role: UserRole.User,
			});
			const userToken = await getAuthToken(dataSource, regularUser);
			const agent = await createAgent(dataSource, org.id!, {
				createdBy: admin.id!,
			});

			// Admin soft-deletes
			await createTestRequest(app, logger)
				.delete(`/organization/${org.id}/agents/${agent.id}`)
				.auth(adminToken)
				.expect(200);

			// Regular user tries to restore
			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/agents/${agent.id}/restore`)
				.auth(userToken)
				.expect(403);

			logger.logAssertion(
				'regular user restore returns 403',
				res.status === 403,
			);
			expect(res.status).toBe(403);
		});
	});
});
