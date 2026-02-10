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

describe('Evaluation Endpoint (E2E Real)', () => {
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
		logger = new TestLogger('Evaluation Endpoint');
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

	// ─── VALIDATION ─────────────────────────────────────────────────────────────

	describe('POST /organization/:orgId/image-generation/evaluate — Validation', () => {
		it('should return failure for missing brief', async () => {
			const org = await createOrganization(dataSource);
			const admin = await createUser(dataSource, org.id!, {
				role: UserRole.Admin,
			});
			const token = await getAuthToken(dataSource, admin);
			const judge = await createAgent(dataSource, org.id!, {
				canJudge: true,
			});

			// NestJS @Post returns 201 by default, even for validation failures
			// returned as plain ResponseEnvelope (not thrown as HttpException)
			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/evaluate`)
				.auth(token)
				.send({
					imageUrls: ['https://example.com/img.jpg'],
					judgeIds: [judge.id],
				})
				.expect(201);

			logger.logAssertion(
				'missing brief returns failure status',
				res.body.status === 'failure',
			);
			expect(res.body.status).toBe('failure');
			expect(res.body.message).toContain('brief');
		});

		it('should return failure for missing imageUrls', async () => {
			const org = await createOrganization(dataSource);
			const admin = await createUser(dataSource, org.id!, {
				role: UserRole.Admin,
			});
			const token = await getAuthToken(dataSource, admin);
			const judge = await createAgent(dataSource, org.id!, {
				canJudge: true,
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/evaluate`)
				.auth(token)
				.send({
					brief: 'Test brief',
					judgeIds: [judge.id],
				})
				.expect(201);

			logger.logAssertion(
				'missing imageUrls returns failure',
				res.body.status === 'failure',
			);
			expect(res.body.status).toBe('failure');
			expect(res.body.message).toContain('imageUrl');
		});

		it('should return failure for missing judgeIds', async () => {
			const org = await createOrganization(dataSource);
			const admin = await createUser(dataSource, org.id!, {
				role: UserRole.Admin,
			});
			const token = await getAuthToken(dataSource, admin);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/evaluate`)
				.auth(token)
				.send({
					brief: 'Test brief',
					imageUrls: ['https://example.com/img.jpg'],
				})
				.expect(201);

			logger.logAssertion(
				'missing judgeIds returns failure',
				res.body.status === 'failure',
			);
			expect(res.body.status).toBe('failure');
			expect(res.body.message).toContain('judgeId');
		});

		it('should return failure for non-existent judge IDs', async () => {
			const org = await createOrganization(dataSource);
			const admin = await createUser(dataSource, org.id!, {
				role: UserRole.Admin,
			});
			const token = await getAuthToken(dataSource, admin);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/evaluate`)
				.auth(token)
				.send({
					brief: 'Test brief',
					imageUrls: ['https://example.com/img.jpg'],
					judgeIds: ['00000000-0000-4000-8000-000000000099'],
				})
				.expect(201);

			logger.logAssertion(
				'non-existent judgeIds returns failure',
				res.body.status === 'failure',
			);
			expect(res.body.status).toBe('failure');
			expect(res.body.message).toContain('not found');
		});

		it('should return failure for non-judge agents used as judges', async () => {
			const org = await createOrganization(dataSource);
			const admin = await createUser(dataSource, org.id!, {
				role: UserRole.Admin,
			});
			const token = await getAuthToken(dataSource, admin);
			const nonJudge = await createAgent(dataSource, org.id!, {
				canJudge: false,
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/evaluate`)
				.auth(token)
				.send({
					brief: 'Test brief',
					imageUrls: ['https://example.com/img.jpg'],
					judgeIds: [nonJudge.id],
				})
				.expect(201);

			logger.logAssertion(
				'non-judge agent returns failure',
				res.body.status === 'failure',
			);
			expect(res.body.status).toBe('failure');
			expect(res.body.message).toContain('not configured as judges');
		});
	});

	// ─── ROLE RESTRICTIONS ──────────────────────────────────────────────────────

	describe('POST /organization/:orgId/image-generation/evaluate — Role Access', () => {
		it('should allow Admin access', async () => {
			const org = await createOrganization(dataSource);
			const admin = await createUser(dataSource, org.id!, {
				role: UserRole.Admin,
			});
			const token = await getAuthToken(dataSource, admin);
			const judge = await createAgent(dataSource, org.id!, {
				canJudge: true,
			});

			// We just need to verify it doesn't reject with 403
			// The actual evaluation may fail due to missing Gemini API key,
			// but we're testing that the guard allows Admin through
			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/evaluate`)
				.auth(token)
				.send({
					brief: 'Test brief',
					imageUrls: ['https://example.com/img.jpg'],
					judgeIds: [judge.id],
				});

			logger.logAssertion(
				'Admin not denied (not 403)',
				res.status !== 403,
			);
			expect(res.status).not.toBe(403);
		});

		it('should allow SuperAdmin access', async () => {
			const org = await createOrganization(dataSource);
			const superAdmin = await createUser(dataSource, org.id!, {
				role: UserRole.SuperAdmin,
			});
			const token = await getAuthToken(dataSource, superAdmin);
			const judge = await createAgent(dataSource, org.id!, {
				canJudge: true,
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/evaluate`)
				.auth(token)
				.send({
					brief: 'Test brief',
					imageUrls: ['https://example.com/img.jpg'],
					judgeIds: [judge.id],
				});

			logger.logAssertion(
				'SuperAdmin not denied (not 403)',
				res.status !== 403,
			);
			expect(res.status).not.toBe(403);
		});

		it('should deny regular User access (403)', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!, {
				role: UserRole.User,
			});
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/evaluate`)
				.auth(token)
				.send({
					brief: 'Test brief',
					imageUrls: ['https://example.com/img.jpg'],
					judgeIds: ['00000000-0000-4000-8000-000000000001'],
				})
				.expect(403);

			logger.logAssertion('User denied (403)', res.status === 403);
			expect(res.status).toBe(403);
		});

		it('should deny Manager access (403)', async () => {
			const org = await createOrganization(dataSource);
			const manager = await createUser(dataSource, org.id!, {
				role: UserRole.Manager,
			});
			const token = await getAuthToken(dataSource, manager);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/evaluate`)
				.auth(token)
				.send({
					brief: 'Test brief',
					imageUrls: ['https://example.com/img.jpg'],
					judgeIds: ['00000000-0000-4000-8000-000000000001'],
				})
				.expect(403);

			logger.logAssertion('Manager denied (403)', res.status === 403);
			expect(res.status).toBe(403);
		});

		it('should deny Guest access (403)', async () => {
			const org = await createOrganization(dataSource);
			const guest = await createUser(dataSource, org.id!, {
				role: UserRole.Guest,
			});
			const token = await getAuthToken(dataSource, guest);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/evaluate`)
				.auth(token)
				.send({
					brief: 'Test brief',
					imageUrls: ['https://example.com/img.jpg'],
					judgeIds: ['00000000-0000-4000-8000-000000000001'],
				})
				.expect(403);

			logger.logAssertion('Guest denied (403)', res.status === 403);
			expect(res.status).toBe(403);
		});

		it('should return 401 without auth', async () => {
			const org = await createOrganization(dataSource);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/image-generation/evaluate`)
				.send({
					brief: 'Test brief',
					imageUrls: ['https://example.com/img.jpg'],
					judgeIds: ['00000000-0000-4000-8000-000000000001'],
				})
				.expect(401);

			logger.logAssertion('no auth returns 401', res.status === 401);
			expect(res.status).toBe(401);
		});
	});

	// ─── CROSS-ORG ISOLATION ────────────────────────────────────────────────────

	describe('Cross-Organization Isolation', () => {
		it('should deny cross-org evaluation access (403)', async () => {
			const org1 = await createOrganization(dataSource);
			const org2 = await createOrganization(dataSource);
			const admin1 = await createUser(dataSource, org1.id!, {
				role: UserRole.Admin,
			});
			const token1 = await getAuthToken(dataSource, admin1);
			const judge2 = await createAgent(dataSource, org2.id!, {
				canJudge: true,
			});

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org2.id}/image-generation/evaluate`)
				.auth(token1)
				.send({
					brief: 'Cross org test',
					imageUrls: ['https://example.com/img.jpg'],
					judgeIds: [judge2.id],
				})
				.expect(403);

			logger.logAssertion(
				'cross-org evaluate returns 403',
				res.status === 403,
			);
			expect(res.status).toBe(403);
		});
	});
});
