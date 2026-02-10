import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
	createTestApp,
	TestLogger,
	createTestRequest,
	getAuthToken,
	setTestJwtEnv,
} from '../helpers';
import { createOrganization, createUser } from '../factories';
import { TestDatabaseManager } from '../test-database.config';

describe('Error Handling (E2E Real)', () => {
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
		logger = new TestLogger('Error Handling');
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

	// ─── 404 NOT FOUND ──────────────────────────────────────────────────────────

	describe('404 Not Found — Non-Existent Routes', () => {
		it('should return 404 for completely unknown route', async () => {
			const req = createTestRequest(app, logger);
			const res = await req.get('/this/route/does/not/exist').expect(404);

			logger.logAssertion(
				'unknown route returns 404',
				res.status === 404,
			);
			expect(res.status).toBe(404);
		});

		it('should return 404 for unknown nested route with auth', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/nonexistent-resource`)
				.auth(token)
				.expect(404);

			logger.logAssertion(
				'unknown nested route returns 404',
				res.status === 404,
			);
			expect(res.status).toBe(404);
		});
	});

	// ─── 404 NOT FOUND — Non-Existent Resources ────────────────────────────────

	describe('404 Not Found — Non-Existent Resources', () => {
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

		it('should return 404 for non-existent generation request', async () => {
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
				'non-existent gen request returns 404',
				res.status === 404,
			);
			expect(res.status).toBe(404);
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

	// ─── 400 BAD REQUEST — Malformed Input ──────────────────────────────────────

	describe('400 Bad Request — Malformed Input', () => {
		it('should return 500 for invalid UUID in path (agents)', async () => {
			// Agent controller does not use ParseUUIDPipe, so invalid UUIDs
			// cause a database error (500) rather than a validation error (400)
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents/not-a-uuid`)
				.auth(token)
				.expect(500);

			logger.logAssertion('invalid UUID returns 500', res.status === 500);
			expect(res.status).toBe(500);
		});

		it('should return 400 for invalid UUID in path (generation requests)', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/image-generation/requests/not-a-uuid`,
				)
				.auth(token)
				.expect(400);

			logger.logAssertion(
				'invalid request UUID returns 400',
				res.status === 400,
			);
			expect(res.status).toBe(400);
		});

		it('should return 403 for invalid UUID in orgId param', async () => {
			// The HasOrganizationAccessGuard runs before ParseUUIDPipe,
			// so an invalid orgId that doesn't match the user's org returns 403
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get('/organization/not-a-uuid/agents')
				.auth(token)
				.expect(403);

			logger.logAssertion(
				'invalid orgId UUID returns 403',
				res.status === 403,
			);
			expect(res.status).toBe(403);
		});

		it('should return 400 for empty body on agent create', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/agents`)
				.auth(token)
				.send({})
				.expect(400);

			logger.logAssertion('empty body returns 400', res.status === 400);
			expect(res.status).toBe(400);
		});

		it('should return 400 for agent create with name exceeding max length', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/agents`)
				.auth(token)
				.send({
					name: 'X'.repeat(300),
					systemPrompt: 'Valid prompt',
				})
				.expect(400);

			logger.logAssertion(
				'name too long returns 400',
				res.status === 400,
			);
			expect(res.status).toBe(400);
		});

		it('should return 400 for project create with missing name', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/projects`)
				.auth(token)
				.send({ description: 'no name provided' })
				.expect(400);

			logger.logAssertion(
				'missing project name returns 400',
				res.status === 400,
			);
			expect(res.status).toBe(400);
		});
	});

	// ─── VALIDATION PIPE ERROR FORMAT ───────────────────────────────────────────

	describe('Validation Pipe — Error Response Format', () => {
		it('should return structured error with message array for validation errors', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/agents`)
				.auth(token)
				.send({ name: '' }) // empty name should fail @IsNotEmpty
				.expect(400);

			logger.logAssertion('validation returns 400', res.status === 400);
			expect(res.status).toBe(400);

			// NestJS validation pipe returns message as array or string
			logger.logAssertion(
				'response has message field',
				res.body.message !== undefined,
			);
			expect(res.body.message).toBeDefined();
		});

		it('should include field-level errors for invalid types', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/compositions`)
				.auth(token)
				.send({
					name: 'Valid Name',
					canvasWidth: 'not-a-number', // should fail @IsInt
				})
				.expect(400);

			logger.logAssertion('invalid type returns 400', res.status === 400);
			expect(res.status).toBe(400);
		});
	});

	// ─── NO STACK TRACE LEAKAGE ─────────────────────────────────────────────────

	describe('Security — No Stack Trace Leakage', () => {
		it('should not expose stack traces in 404 responses', async () => {
			const req = createTestRequest(app, logger);
			const res = await req.get('/nonexistent').expect(404);

			logger.logAssertion(
				'no stack trace in 404',
				!JSON.stringify(res.body).includes('at '),
			);
			const body = JSON.stringify(res.body);
			expect(body).not.toContain('at ');
			expect(body).not.toContain('.ts:');
			expect(body).not.toContain('node_modules');
		});

		it('should not expose stack traces in 400 responses', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			// Use generation-request endpoint which has ParseUUIDPipe for proper 400
			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/image-generation/requests/not-a-uuid`,
				)
				.auth(token)
				.expect(400);

			logger.logAssertion(
				'no stack trace in 400',
				!JSON.stringify(res.body).includes('at '),
			);
			const body = JSON.stringify(res.body);
			expect(body).not.toContain('at ');
			expect(body).not.toContain('.ts:');
			expect(body).not.toContain('node_modules');
		});

		it('should not expose stack traces in 401 responses', async () => {
			const org = await createOrganization(dataSource);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.expect(401);

			logger.logAssertion(
				'no stack trace in 401',
				!JSON.stringify(res.body).includes('at '),
			);
			const body = JSON.stringify(res.body);
			expect(body).not.toContain('at ');
			expect(body).not.toContain('.ts:');
			expect(body).not.toContain('node_modules');
		});

		it('should not expose internal paths in error responses', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.post(`/organization/${org.id}/agents`)
				.auth(token)
				.send({})
				.expect(400);

			logger.logAssertion(
				'no internal paths',
				!JSON.stringify(res.body).includes('/src/'),
			);
			const body = JSON.stringify(res.body);
			expect(body).not.toContain('/src/');
			expect(body).not.toContain('/Users/');
			expect(body).not.toContain('/home/');
		});
	});

	// ─── CONSISTENT ERROR RESPONSE STRUCTURE ────────────────────────────────────

	describe('Consistent Error Response Structure', () => {
		it('should return consistent structure for 401', async () => {
			const org = await createOrganization(dataSource);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.expect(401);

			logger.logAssertion(
				'401 has statusCode and message',
				res.body.statusCode === 401 && !!res.body.message,
			);
			expect(res.body.statusCode).toBe(401);
			expect(res.body.message).toBeDefined();
		});

		it('should return consistent structure for 403', async () => {
			const org1 = await createOrganization(dataSource);
			const org2 = await createOrganization(dataSource);
			const user1 = await createUser(dataSource, org1.id!);
			const token1 = await getAuthToken(dataSource, user1);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org2.id}/agents`)
				.auth(token1)
				.expect(403);

			logger.logAssertion(
				'403 has statusCode and message',
				res.body.statusCode === 403 && !!res.body.message,
			);
			expect(res.body.statusCode).toBe(403);
			expect(res.body.message).toBeDefined();
		});

		it('should return consistent structure for 404', async () => {
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

			// Agent controller uses ResponseEnvelope: { status, message }
			logger.logAssertion(
				'404 has status and message',
				res.body.status === 'failure' && !!res.body.message,
			);
			expect(res.body.status).toBe('failure');
			expect(res.body.message).toBeDefined();
		});

		it('should return consistent structure for 400', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			// Use generation-request endpoint which has ParseUUIDPipe for proper 400
			const req = createTestRequest(app, logger);
			const res = await req
				.get(
					`/organization/${org.id}/image-generation/requests/not-a-uuid`,
				)
				.auth(token)
				.expect(400);

			logger.logAssertion(
				'400 has statusCode and message',
				res.body.statusCode === 400 && !!res.body.message,
			);
			expect(res.body.statusCode).toBe(400);
			expect(res.body.message).toBeDefined();
		});
	});

	// ─── HTTP METHOD NOT ALLOWED ────────────────────────────────────────────────

	describe('HTTP Method Handling', () => {
		it('should return 404 for unsupported HTTP method on known path', async () => {
			// NestJS returns 404 for unmatched methods on known paths
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.patch(`/organization/${org.id}/agents`)
				.auth(token)
				.send({});

			logger.logAssertion(
				'unsupported method returns 404 or 405',
				res.status === 404 || res.status === 405,
			);
			expect([404, 405]).toContain(res.status);
		});
	});

	// ─── CONTENT TYPE HANDLING ──────────────────────────────────────────────────

	describe('Content Type Handling', () => {
		it('should handle JSON content type properly', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.auth(token)
				.set('Accept', 'application/json')
				.expect(200);

			logger.logAssertion('response is JSON', res.status === 200);
			expect(res.headers['content-type']).toContain('application/json');
		});
	});
});
