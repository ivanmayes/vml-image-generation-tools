import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';

import {
	createTestApp,
	TestLogger,
	createTestRequest,
	getAuthToken,
	getTestKeyPair,
	setTestJwtEnv,
} from '../helpers';
import { createOrganization, createUser } from '../factories';
import { TestDatabaseManager } from '../test-database.config';

describe('Authentication Flow (E2E Real)', () => {
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
		logger = new TestLogger('Authentication Flow');
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

	describe('Protected Endpoints — Token Validation', () => {
		it('should reject requests without Authorization header (401)', async () => {
			const org = await createOrganization(dataSource);
			const req = createTestRequest(app, logger);

			const res = await req
				.get(`/organization/${org.id}/agents`)
				.expect(401);

			logger.logAssertion('response.status === 401', res.status === 401);
			expect(res.status).toBe(401);
		});

		it('should reject requests with invalid JWT (401)', async () => {
			const org = await createOrganization(dataSource);
			const req = createTestRequest(app, logger);

			const res = await req
				.get(`/organization/${org.id}/agents`)
				.auth('invalid.jwt.token')
				.expect(401);

			logger.logAssertion('response.status === 401', res.status === 401);
			expect(res.status).toBe(401);
		});

		it('should reject requests with expired JWT (401)', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const { privateKey } = getTestKeyPair();

			// Create an already-expired token
			const expiredToken = jwt.sign(
				{
					id: user.id,
					email: user.email,
					emailNormalized: user.emailNormalized,
					role: user.role,
				},
				privateKey,
				{ algorithm: 'RS256', expiresIn: '-1s' },
			);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.auth(expiredToken)
				.expect(401);

			logger.logAssertion(
				'response.status === 401 (expired)',
				res.status === 401,
			);
			expect(res.status).toBe(401);
		});

		it('should reject requests with a revoked token (401)', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);

			// Generate a valid token but do NOT store it in authTokens
			const { privateKey } = getTestKeyPair();
			const revokedToken = jwt.sign(
				{
					id: user.id,
					email: user.email,
					emailNormalized: user.emailNormalized,
					role: user.role,
				},
				privateKey,
				{ algorithm: 'RS256', expiresIn: '1h' },
			);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.auth(revokedToken)
				.expect(401);

			logger.logAssertion(
				'response.status === 401 (revoked)',
				res.status === 401,
			);
			expect(res.status).toBe(401);
		});

		it('should accept requests with a valid JWT (200)', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.auth(token)
				.expect(200);

			logger.logAssertion('response.status === 200', res.status === 200);
			expect(res.status).toBe(200);

			logger.logAssertion(
				'body.status === "success"',
				res.body.status === 'success',
			);
			expect(res.body.status).toBe('success');
		});

		it('should reject deactivated users (401)', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!, {
				deactivated: true,
			});

			// Manually create token and store it
			const { privateKey } = getTestKeyPair();
			const token = jwt.sign(
				{
					id: user.id,
					email: user.email,
					emailNormalized: user.emailNormalized,
					role: user.role,
				},
				privateKey,
				{ algorithm: 'RS256', expiresIn: '1h' },
			);

			// Store token in user's authTokens
			const repo = dataSource.getRepository('User');
			await repo.update(user.id!, { authTokens: [token] });

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.auth(token)
				.expect(401);

			logger.logAssertion(
				'response.status === 401 (deactivated)',
				res.status === 401,
			);
			expect(res.status).toBe(401);
		});
	});

	describe('Token Refresh', () => {
		it('GET /user/refresh should return a new token', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req.get('/user/refresh').auth(token).expect(200);

			logger.logAssertion('response.status === 200', res.status === 200);
			expect(res.status).toBe(200);

			logger.logAssertion(
				'body.data.token is defined',
				!!res.body.data?.token,
			);
			expect(res.body.data?.token).toBeDefined();

			logger.logAssertion(
				'new token differs from old',
				res.body.data.token !== token,
			);
			expect(res.body.data.token).not.toBe(token);

			logger.logAssertion(
				'body.data.user is defined',
				!!res.body.data?.user,
			);
			expect(res.body.data?.user).toBeDefined();
		});

		it('should reject refresh without token (401)', async () => {
			const req = createTestRequest(app, logger);
			const res = await req.get('/user/refresh').expect(401);

			logger.logAssertion('response.status === 401', res.status === 401);
			expect(res.status).toBe(401);
		});
	});

	describe('Sign Out', () => {
		it('POST /user/sign-out should remove the token', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			// NestJS @Post returns 201 by default
			const req = createTestRequest(app, logger);
			const res = await req
				.post('/user/sign-out')
				.auth(token)
				.expect(201);

			logger.logAssertion(
				'sign-out response.status === 201',
				res.status === 201,
			);
			expect(res.status).toBe(201);

			// After sign out, using the same token should fail
			const req2 = createTestRequest(app, logger);
			const res2 = await req2
				.get('/user/refresh')
				.auth(token)
				.expect(401);

			logger.logAssertion(
				'token revoked after sign-out (401)',
				res2.status === 401,
			);
			expect(res2.status).toBe(401);
		});
	});
});
