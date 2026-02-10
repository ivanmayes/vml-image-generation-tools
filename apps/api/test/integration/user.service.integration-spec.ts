import { DataSource, Repository } from 'typeorm';

import { User } from '../../src/user/user.entity';
import { UserService } from '../../src/user/user.service';
import { UserRole } from '../../src/user/user-role.enum';
import { TestDatabaseManager } from '../test-database.config';
import { createOrganization, createUser } from '../factories';

/**
 * UserService Integration Tests
 *
 * Tests hit a REAL PostgreSQL database. Zero mocks.
 */
describe('UserService (Integration)', () => {
	let dbManager: TestDatabaseManager;
	let ds: DataSource;
	let userService: UserService;
	let userRepo: Repository<User>;

	beforeAll(async () => {
		console.log('[UserService] Initializing test database...');
		dbManager = new TestDatabaseManager();
		ds = await dbManager.initialize();
		console.log('[UserService] DB connected.');

		userRepo = ds.getRepository(User);
		userService = new UserService(userRepo, ds);
	});

	beforeEach(async () => {
		console.log('[UserService] Truncating tables...');
		await dbManager.reset();
	});

	afterAll(async () => {
		console.log('[UserService] Closing database connection...');
		await dbManager.destroy();
	});

	// ── addOne() ──────────────────────────────────────────────────────────────

	describe('addOne()', () => {
		it('should create a user with normalized email', async () => {
			const org = await createOrganization(ds);

			const user = await userService.addOne({
				email: 'Test.User@Example.COM',
				organizationId: org.id,
				role: UserRole.User,
				profile: { nameFirst: 'Test', nameLast: 'User' },
				deactivated: false,
				authTokens: [],
			});

			expect(user.id).toBeDefined();
			expect(user.emailNormalized).toBe('test.user@example.com');
		});

		it('should throw for user without email', async () => {
			await expect(
				userService.addOne({
					organizationId: 'some-id',
					role: UserRole.User,
				}),
			).rejects.toEqual('Invalid user. Missing email.');
		});
	});

	// ── findOne() ─────────────────────────────────────────────────────────────

	describe('findOne()', () => {
		it('should find user by ID', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id, {
				profile: { nameFirst: 'Jane', nameLast: 'Doe' },
			});

			const found = await userService.findOne({
				where: { id: user.id! },
			});

			expect(found).not.toBeNull();
			expect(found!.id).toBe(user.id);
		});

		it('should find user by email', async () => {
			const org = await createOrganization(ds);
			const email = `findme-${Date.now()}@test.com`;
			await createUser(ds, org.id, {
				email,
				emailNormalized: email.toLowerCase(),
			});

			const found = await userService.findOne({
				where: { emailNormalized: email.toLowerCase() },
			});

			expect(found).not.toBeNull();
			expect(found!.email).toBe(email);
		});

		it('should return null for non-existent user', async () => {
			const found = await userService.findOne({
				where: { id: '00000000-0000-4000-8000-000000000099' },
			});
			expect(found).toBeNull();
		});
	});

	// ── updateOne() ───────────────────────────────────────────────────────────

	describe('updateOne()', () => {
		it('should update user fields', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id, {
				profile: { nameFirst: 'Before', nameLast: 'Update' },
			});

			user.profile = { nameFirst: 'After', nameLast: 'Update' };
			const updated = await userService.updateOne(user);

			expect(updated.profile?.nameFirst).toBe('After');
		});
	});

	// ── findByEmails() ────────────────────────────────────────────────────────

	describe('findByEmails()', () => {
		it('should batch-find users by normalized emails', async () => {
			const org = await createOrganization(ds);
			const email1 = `batch1-${Date.now()}@test.com`;
			const email2 = `batch2-${Date.now()}@test.com`;
			await createUser(ds, org.id, {
				email: email1,
				emailNormalized: email1,
			});
			await createUser(ds, org.id, {
				email: email2,
				emailNormalized: email2,
			});

			const users = await userService.findByEmails([email1, email2]);

			expect(users).toHaveLength(2);
		});

		it('should return empty array for empty emails', async () => {
			const users = await userService.findByEmails([]);
			expect(users).toEqual([]);
		});

		it('should return empty array for non-existent emails', async () => {
			const users = await userService.findByEmails([
				'nonexistent@test.com',
			]);
			expect(users).toEqual([]);
		});
	});

	// ── canAccess() ───────────────────────────────────────────────────────────

	describe('canAccess()', () => {
		it('should return true when user belongs to organization', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id);

			const result = await userService.canAccess(user, {
				organizationId: org.id,
			});
			expect(result).toBe(true);
		});

		it('should return false when user belongs to different organization', async () => {
			const org1 = await createOrganization(ds);
			const org2 = await createOrganization(ds);
			const user = await createUser(ds, org1.id);

			const result = await userService.canAccess(user, {
				organizationId: org2.id,
			});
			expect(result).toBe(false);
		});
	});

	// ── promoteUser() ─────────────────────────────────────────────────────────

	describe('promoteUser()', () => {
		it('should promote user to a higher role', async () => {
			const org = await createOrganization(ds);
			const admin = await createUser(ds, org.id, {
				role: UserRole.Admin,
			});
			const regularUser = await createUser(ds, org.id, {
				role: UserRole.User,
			});

			const promoted = await userService.promoteUser(
				regularUser.id!,
				UserRole.Manager,
				admin,
			);

			expect(promoted.role).toBe(UserRole.Manager);
		});

		it('should throw for cross-org promotion', async () => {
			const org1 = await createOrganization(ds);
			const org2 = await createOrganization(ds);
			const admin = await createUser(ds, org1.id, {
				role: UserRole.Admin,
			});
			const targetUser = await createUser(ds, org2.id, {
				role: UserRole.User,
			});

			await expect(
				userService.promoteUser(
					targetUser.id!,
					UserRole.Manager,
					admin,
				),
			).rejects.toThrow("don't have access");
		});
	});

	// ── banUser() ─────────────────────────────────────────────────────────────

	describe('banUser()', () => {
		it('should ban and unban a user', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id, { deactivated: false });

			const banned = await userService.banUser(user.id!, true);
			expect(banned.deactivated).toBe(true);

			const unbanned = await userService.banUser(user.id!, false);
			expect(unbanned.deactivated).toBe(false);
		});

		it('should throw for non-existent user', async () => {
			await expect(
				userService.banUser(
					'00000000-0000-4000-8000-000000000099',
					true,
				),
			).rejects.toThrow('User not found');
		});
	});

	// ── Cross-org isolation ───────────────────────────────────────────────────

	describe('Cross-org isolation', () => {
		it('should not find users from different organizations when scoping by orgId', async () => {
			const org1 = await createOrganization(ds);
			const org2 = await createOrganization(ds);
			await createUser(ds, org1.id, {
				email: 'org1@test.com',
				emailNormalized: 'org1@test.com',
			});
			await createUser(ds, org2.id, {
				email: 'org2@test.com',
				emailNormalized: 'org2@test.com',
			});

			const org1Users = await userService.find({
				where: { organizationId: org1.id },
			});
			const org2Users = await userService.find({
				where: { organizationId: org2.id },
			});

			expect(org1Users).toHaveLength(1);
			expect(org1Users[0].email).toBe('org1@test.com');
			expect(org2Users).toHaveLength(1);
			expect(org2Users[0].email).toBe('org2@test.com');
		});
	});
});
