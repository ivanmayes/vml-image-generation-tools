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
import { UserRole } from '../../src/user/user-role.enum';

describe('Guards Integration (E2E Real)', () => {
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
		logger = new TestLogger('Guards Integration');
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

	describe('AuthGuard', () => {
		it('should allow authenticated user to access protected endpoint', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'authenticated access returns 200',
				res.status === 200,
			);
			expect(res.status).toBe(200);
		});

		it('should reject unauthenticated access (401)', async () => {
			const org = await createOrganization(dataSource);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.expect(401);

			logger.logAssertion(
				'unauthenticated access returns 401',
				res.status === 401,
			);
			expect(res.status).toBe(401);
		});
	});

	describe('HasOrganizationAccessGuard', () => {
		it('should allow user to access their own organization', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'own org access returns 200',
				res.status === 200,
			);
			expect(res.status).toBe(200);
		});

		it('should deny user access to a different organization (403)', async () => {
			const org1 = await createOrganization(dataSource);
			const org2 = await createOrganization(dataSource);
			const user = await createUser(dataSource, org1.id!);
			const token = await getAuthToken(dataSource, user);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org2.id}/agents`)
				.auth(token)
				.expect(403);

			logger.logAssertion(
				'cross-org access returns 403',
				res.status === 403,
			);
			expect(res.status).toBe(403);
		});

		it('should allow SuperAdmin to access any organization', async () => {
			const org1 = await createOrganization(dataSource);
			const org2 = await createOrganization(dataSource);
			const superAdmin = await createUser(dataSource, org1.id!, {
				role: UserRole.SuperAdmin,
			});
			const token = await getAuthToken(dataSource, superAdmin);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org2.id}/agents`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'SuperAdmin cross-org access returns 200',
				res.status === 200,
			);
			expect(res.status).toBe(200);
		});
	});

	describe('RolesGuard', () => {
		it('should allow Admin to access admin-only endpoints', async () => {
			const org = await createOrganization(dataSource);
			const admin = await createUser(dataSource, org.id!, {
				role: UserRole.Admin,
			});
			const token = await getAuthToken(dataSource, admin);

			// Admin users endpoint is admin-only
			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/admin/organization/${org.id}/user`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'Admin access to admin endpoint returns 200',
				res.status === 200,
			);
			expect(res.status).toBe(200);
		});

		it('should deny regular User access to admin-only endpoints (403)', async () => {
			const org = await createOrganization(dataSource);
			const regularUser = await createUser(dataSource, org.id!, {
				role: UserRole.User,
			});
			const token = await getAuthToken(dataSource, regularUser);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/admin/organization/${org.id}/user`)
				.auth(token)
				.expect(403);

			logger.logAssertion(
				'regular user denied admin endpoint (403)',
				res.status === 403,
			);
			expect(res.status).toBe(403);
		});

		it('should deny Guest access to standard endpoints (403)', async () => {
			const org = await createOrganization(dataSource);
			const guest = await createUser(dataSource, org.id!, {
				role: UserRole.Guest,
			});
			const token = await getAuthToken(dataSource, guest);

			// Agents endpoint requires User/Manager/Admin/SuperAdmin
			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.auth(token)
				.expect(403);

			logger.logAssertion(
				'Guest denied standard endpoint (403)',
				res.status === 403,
			);
			expect(res.status).toBe(403);
		});

		it('should allow Manager to access standard endpoints', async () => {
			const org = await createOrganization(dataSource);
			const manager = await createUser(dataSource, org.id!, {
				role: UserRole.Manager,
			});
			const token = await getAuthToken(dataSource, manager);

			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'Manager access to standard endpoint returns 200',
				res.status === 200,
			);
			expect(res.status).toBe(200);
		});
	});

	describe('Guard Composition — Multiple Guards', () => {
		it('should enforce all guards: auth + role + org access', async () => {
			const org = await createOrganization(dataSource);
			const user = await createUser(dataSource, org.id!, {
				role: UserRole.User,
			});
			const token = await getAuthToken(dataSource, user);

			// Regular user with valid auth, correct org, correct role
			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.auth(token)
				.expect(200);

			logger.logAssertion(
				'all guards pass returns 200',
				res.status === 200,
			);
			expect(res.status).toBe(200);
		});

		it('should fail fast on first guard failure (auth before role)', async () => {
			const org = await createOrganization(dataSource);

			// No auth token at all — should fail at AuthGuard before RolesGuard
			const req = createTestRequest(app, logger);
			const res = await req
				.get(`/organization/${org.id}/agents`)
				.expect(401);

			logger.logAssertion(
				'no token returns 401 (auth guard)',
				res.status === 401,
			);
			expect(res.status).toBe(401);
		});
	});
});
