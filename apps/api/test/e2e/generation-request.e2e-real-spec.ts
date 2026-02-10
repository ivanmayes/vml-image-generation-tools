import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
	createTestApp,
	TestLogger,
	createTestRequest,
	getAuthToken,
	setTestJwtEnv,
} from '../helpers';
import {
	createOrganization,
	createUser,
	createAgent,
	createGenerationRequest,
} from '../factories';
import { TestDatabaseManager } from '../test-database.config';
import {
	GenerationRequest,
	GenerationRequestStatus,
} from '../../src/image-generation/entities/generation-request.entity';

describe('Generation Request Flow (E2E Real)', () => {
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
		logger = new TestLogger('Generation Request Flow');
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

	describe('GET /organization/:orgId/image-generation/requests — List Requests', () => {
		it('should list generation requests for organization', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const agent = await createAgent(dataSource, org.id!, {
				canJudge: true,
			});

			await createGenerationRequest(dataSource, org.id!, [agent.id!]);
			await createGenerationRequest(dataSource, org.id!, [agent.id!]);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/image-generation/requests`)
				.auth(token)
				.expect(200);

			logger.logAssertion('response.status === 200', res.status === 200);
			expect(res.status).toBe(200);

			logger.logAssertion(
				'body.data has 2 requests',
				res.body.data?.length === 2,
			);
			expect(res.body.data).toHaveLength(2);
		});

		it('should return empty array for org with no requests', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/image-generation/requests`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'empty data array',
				res.body.data?.length === 0,
			);
			expect(res.body.data).toEqual([]);
		});

		it('should respect cross-org isolation', async () => {
			const org1 = await createOrganization(dataSource);
			const org2 = await createOrganization(dataSource);
			const user1 = await createUser(dataSource, org1.id!);
			const token1 = await getAuthToken(dataSource, user1);
			const agent1 = await createAgent(dataSource, org1.id!, {
				canJudge: true,
			});
			const agent2 = await createAgent(dataSource, org2.id!, {
				canJudge: true,
			});

			await createGenerationRequest(dataSource, org1.id!, [agent1.id!]);
			await createGenerationRequest(dataSource, org2.id!, [agent2.id!]);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org1.id}/image-generation/requests`)
				.auth(token1)
				.expect(200);

			logger.logAssertion(
				'only org1 requests returned',
				res.body.data?.length === 1,
			);
			expect(res.body.data).toHaveLength(1);
		});

		it('should reject invalid orgId UUID format (403)', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			// Guard runs before ParseUUIDPipe, so invalid orgId returns 403
			// because it doesn't match the user's organization
			const req = createTestRequest(app, logger);
			const res = await req
				.get('/organization/not-a-uuid/image-generation/requests')
				.auth(token)
				.expect(403);

			logger.logAssertion('invalid UUID returns 403', res.status === 403);
			expect(res.status).toBe(403);
		});
	});

	describe('GET /organization/:orgId/image-generation/requests/:id — Get Request', () => {
		it('should get generation request by ID with details', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const agent = await createAgent(dataSource, org.id!, {
				canJudge: true,
			});
			const genReq = await createGenerationRequest(dataSource, org.id!, [
				agent.id!,
			]);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/image-generation/requests/${genReq.id}`,
				)
				.auth(token)
				.expect(200);

			logger.logAssertion('response.status === 200', res.status === 200);
			expect(res.status).toBe(200);

			logger.logAssertion(
				'body.data.id matches',
				res.body.data?.id === genReq.id,
			);
			expect(res.body.data.id).toBe(genReq.id);
			expect(res.body.data.brief).toBeDefined();
			expect(res.body.data.status).toBe('pending');
		});

		it('should return 404 for non-existent request', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/image-generation/requests/00000000-0000-4000-8000-000000000099`,
				)
				.auth(token)
				.expect(404);

			logger.logAssertion(
				'non-existent request returns 404',
				res.status === 404,
			);
			expect(res.status).toBe(404);
		});
	});

	describe('DELETE /organization/:orgId/image-generation/requests/:id — Cancel Request', () => {
		it('should cancel a pending request', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const agent = await createAgent(dataSource, org.id!, {
				canJudge: true,
			});
			const genReq = await createGenerationRequest(
				dataSource,
				org.id!,
				[agent.id!],
				{
					status: GenerationRequestStatus.PENDING,
				},
			);

			const req = createTestRequest(app, logger);
			const res = await req
				.delete(
					`/organization/${org.id}/image-generation/requests/${genReq.id}`,
				)
				.auth(token)
				.expect(200);

			logger.logAssertion('cancel returns 200', res.status === 200);
			expect(res.status).toBe(200);
			expect(res.body.message).toContain('cancelled');

			// Verify status in DB
			const dbReq = await dataSource
				.getRepository(GenerationRequest)
				.findOneBy({ id: genReq.id });
			logger.logAssertion(
				'DB status is cancelled',
				dbReq?.status === GenerationRequestStatus.CANCELLED,
			);
			expect(dbReq!.status).toBe(GenerationRequestStatus.CANCELLED);
		});

		it('should reject cancellation of completed request (400)', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const agent = await createAgent(dataSource, org.id!, {
				canJudge: true,
			});
			const genReq = await createGenerationRequest(
				dataSource,
				org.id!,
				[agent.id!],
				{
					status: GenerationRequestStatus.COMPLETED,
				},
			);

			const req = createTestRequest(app, logger);
			const res = await req
				.delete(
					`/organization/${org.id}/image-generation/requests/${genReq.id}`,
				)
				.auth(token)
				.expect(400);

			logger.logAssertion(
				'cancel completed returns 400',
				res.status === 400,
			);
			expect(res.status).toBe(400);
		});

		it('should return 404 for non-existent request cancel', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.delete(
					`/organization/${org.id}/image-generation/requests/00000000-0000-4000-8000-000000000099`,
				)
				.auth(token)
				.expect(404);

			logger.logAssertion(
				'non-existent cancel returns 404',
				res.status === 404,
			);
			expect(res.status).toBe(404);
		});
	});

	describe('POST /organization/:orgId/image-generation/requests — Create Request (Validation)', () => {
		it('should return 400 for missing required fields (no brief)', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/requests`)
				.auth(token)
				.send({ judgeIds: ['00000000-0000-4000-8000-000000000001'] })
				.expect(400);

			logger.logAssertion(
				'missing brief returns 400',
				res.status === 400,
			);
			expect(res.status).toBe(400);
		});

		it('should return 400 for missing judgeIds', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/requests`)
				.auth(token)
				.send({ brief: 'A test brief' })
				.expect(400);

			logger.logAssertion(
				'missing judgeIds returns 400',
				res.status === 400,
			);
			expect(res.status).toBe(400);
		});

		it('should return 400 for invalid judge IDs (non-existent)', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/requests`)
				.auth(token)
				.send({
					brief: 'Test brief',
					judgeIds: ['00000000-0000-4000-8000-000000000099'],
				})
				.expect(400);

			logger.logAssertion(
				'invalid judgeIds returns 400',
				res.status === 400,
			);
			expect(res.status).toBe(400);
		});

		it('should return 400 for non-judge agents used as judges', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const nonJudge = await createAgent(dataSource, org.id!, {
				canJudge: false,
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/requests`)
				.auth(token)
				.send({
					brief: 'Test brief',
					judgeIds: [nonJudge.id],
				})
				.expect(400);

			logger.logAssertion(
				'non-judge agent returns 400',
				res.status === 400,
			);
			expect(res.status).toBe(400);
		});

		it('should reject cross-org request creation (403)', async () => {
			const org1 = await createOrganization(dataSource);
			const org2 = await createOrganization(dataSource);
			const user = await createUser(dataSource, org1.id!);
			const token = await getAuthToken(dataSource, user);
			const agent = await createAgent(dataSource, org2.id!, {
				canJudge: true,
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org2.id}/image-generation/requests`)
				.auth(token)
				.send({
					brief: 'Test brief',
					judgeIds: [agent.id],
				})
				.expect(403);

			logger.logAssertion(
				'cross-org create returns 403',
				res.status === 403,
			);
			expect(res.status).toBe(403);
		});
	});

	describe('GET /organization/:orgId/image-generation/requests/:id/images — Get Request Images', () => {
		it('should get empty images list for fresh request', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);
			const agent = await createAgent(dataSource, org.id!, {
				canJudge: true,
			});
			const genReq = await createGenerationRequest(dataSource, org.id!, [
				agent.id!,
			]);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/image-generation/requests/${genReq.id}/images`,
				)
				.auth(token)
				.expect(200);

			logger.logAssertion('response.status === 200', res.status === 200);
			expect(res.status).toBe(200);

			logger.logAssertion(
				'body.data is array',
				Array.isArray(res.body.data),
			);
			expect(Array.isArray(res.body.data)).toBe(true);
		});

		it('should return 404 for non-existent request images', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/image-generation/requests/00000000-0000-4000-8000-000000000099/images`,
				)
				.auth(token)
				.expect(404);

			logger.logAssertion(
				'non-existent request images returns 404',
				res.status === 404,
			);
			expect(res.status).toBe(404);
		});
	});
});
