import { DataSource, Repository } from 'typeorm';

import { Space } from '../../src/space/space.entity';
import { SpaceService } from '../../src/space/space.service';
import { SpaceUser } from '../../src/space-user/space-user.entity';
import { SpaceUserService } from '../../src/space-user/space-user.service';
import { SpaceRole } from '../../src/space-user/space-role.enum';
import { User } from '../../src/user/user.entity';
import { AuthenticationStrategy } from '../../src/authentication-strategy/authentication-strategy.entity';
import { UserRole } from '../../src/user/user-role.enum';
import { TestDatabaseManager } from '../test-database.config';
import { createOrganization, createUser } from '../factories';

/**
 * SpaceService + SpaceUserService Integration Tests
 *
 * Tests hit a REAL PostgreSQL database. Zero mocks.
 */
describe('SpaceService + SpaceUserService (Integration)', () => {
	let dbManager: TestDatabaseManager;
	let ds: DataSource;
	let spaceService: SpaceService;
	let spaceUserService: SpaceUserService;
	let spaceRepo: Repository<Space>;
	let spaceUserRepo: Repository<SpaceUser>;
	let userRepo: Repository<User>;
	let authStrategyRepo: Repository<AuthenticationStrategy>;

	beforeAll(async () => {
		console.log('[SpaceService] Initializing test database...');
		dbManager = new TestDatabaseManager();
		ds = await dbManager.initialize();
		console.log('[SpaceService] DB connected.');

		spaceRepo = ds.getRepository(Space);
		spaceUserRepo = ds.getRepository(SpaceUser);
		userRepo = ds.getRepository(User);
		authStrategyRepo = ds.getRepository(AuthenticationStrategy);

		spaceService = new SpaceService(spaceRepo);
		spaceUserService = new SpaceUserService(
			spaceUserRepo,
			userRepo,
			authStrategyRepo,
		);
	});

	beforeEach(async () => {
		console.log('[SpaceService] Truncating tables...');
		await dbManager.reset();
	});

	afterAll(async () => {
		console.log('[SpaceService] Closing database connection...');
		await dbManager.destroy();
	});

	// Helper to create a space
	async function createSpace(
		orgId: string,
		overrides: Partial<Space> = {},
	): Promise<Space> {
		return spaceService.create({
			name: `Test Space ${Date.now()}`,
			organizationId: orgId,
			isPublic: true,
			settings: {},
			approvedWPPOpenTenantIds: [],
			...overrides,
		});
	}

	// ── SpaceService CRUD ─────────────────────────────────────────────────────

	describe('SpaceService CRUD', () => {
		it('should create a space', async () => {
			const org = await createOrganization(ds);
			const space = await createSpace(org.id, { name: 'My Space' });

			expect(space.id).toBeDefined();
			expect(space.name).toBe('My Space');
			expect(space.organizationId).toBe(org.id);
		});

		it('should find a space by ID', async () => {
			const org = await createOrganization(ds);
			const space = await createSpace(org.id, { name: 'FindableSpace' });

			const found = await spaceService.findOne({
				where: { id: space.id },
			});
			expect(found).not.toBeNull();
			expect(found!.name).toBe('FindableSpace');
		});

		it('should update a space', async () => {
			const org = await createOrganization(ds);
			const space = await createSpace(org.id, { name: 'Before' });

			space.name = 'After';
			const updated = await spaceService.update(space);
			expect(updated.name).toBe('After');
		});

		it('should delete a space', async () => {
			const org = await createOrganization(ds);
			const space = await createSpace(org.id);

			await spaceService.delete(space.id);

			const found = await spaceRepo.findOne({ where: { id: space.id } });
			expect(found).toBeNull();
		});
	});

	// ── findSpaces() ──────────────────────────────────────────────────────────

	describe('findSpaces()', () => {
		it('should return spaces for an org', async () => {
			const org = await createOrganization(ds);
			await createSpace(org.id, { name: 'Space A' });
			await createSpace(org.id, { name: 'Space B' });

			const spaces = await spaceService.findSpaces(org.id);
			expect(spaces).toHaveLength(2);
		});

		it('should filter by name query', async () => {
			const org = await createOrganization(ds);
			await createSpace(org.id, { name: 'Marketing Hub' });
			await createSpace(org.id, { name: 'Engineering' });

			const spaces = await spaceService.findSpaces(org.id, 'Marketing');
			expect(spaces).toHaveLength(1);
			expect(spaces[0].name).toBe('Marketing Hub');
		});
	});

	// ── updateSettings() ──────────────────────────────────────────────────────

	describe('updateSettings()', () => {
		it('should update space name and isPublic', async () => {
			const org = await createOrganization(ds);
			const space = await createSpace(org.id, {
				name: 'Old Name',
				isPublic: true,
			});

			const updated = await spaceService.updateSettings(space.id, {
				name: 'New Name',
				isPublic: false,
			});

			expect(updated.name).toBe('New Name');
			expect(updated.isPublic).toBe(false);
		});

		it('should merge settings without overwriting existing', async () => {
			const org = await createOrganization(ds);
			const space = await createSpace(org.id, {
				settings: { theme: 'dark', limit: 100 },
			});

			const updated = await spaceService.updateSettings(space.id, {
				settings: { theme: 'light' },
			});

			expect(updated.settings.theme).toBe('light');
			expect(updated.settings.limit).toBe(100); // preserved
		});

		it('should throw for non-existent space', async () => {
			await expect(
				spaceService.updateSettings(
					'00000000-0000-4000-8000-000000000099',
					{ name: 'X' },
				),
			).rejects.toThrow('Space not found');
		});
	});

	// ── SpaceUserService: addUserToSpace / removeUserFromSpace ────────────────

	describe('SpaceUserService: membership management', () => {
		it('should add and remove a user from a space', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id);
			const space = await createSpace(org.id);

			await spaceUserService.addUserToSpace(
				space.id,
				user.id!,
				SpaceRole.SpaceUser,
			);

			// Verify membership
			const role = await spaceUserService.getUserSpaceRole(
				space.id,
				user.id!,
			);
			expect(role).toBe(SpaceRole.SpaceUser);

			// Remove
			await spaceUserService.removeUserFromSpace(space.id, user.id!);

			const roleAfter = await spaceUserService.getUserSpaceRole(
				space.id,
				user.id!,
			);
			expect(roleAfter).toBeNull();
		});

		it('should prevent duplicate membership', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id);
			const space = await createSpace(org.id);

			await spaceUserService.addUserToSpace(
				space.id,
				user.id!,
				SpaceRole.SpaceUser,
			);

			await expect(
				spaceUserService.addUserToSpace(
					space.id,
					user.id!,
					SpaceRole.SpaceUser,
				),
			).rejects.toThrow('already a member');
		});

		it('should throw when removing non-member', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id);
			const space = await createSpace(org.id);

			await expect(
				spaceUserService.removeUserFromSpace(space.id, user.id!),
			).rejects.toThrow('not a member');
		});
	});

	// ── getUserSpaceRole / isUserSpaceAdmin ───────────────────────────────────

	describe('getUserSpaceRole / isUserSpaceAdmin', () => {
		it('should return correct role for space member', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id);
			const space = await createSpace(org.id);

			await spaceUserService.addUserToSpace(
				space.id,
				user.id!,
				SpaceRole.SpaceAdmin,
			);

			const role = await spaceUserService.getUserSpaceRole(
				space.id,
				user.id!,
			);
			expect(role).toBe(SpaceRole.SpaceAdmin);
		});

		it('should return null for non-member', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id);
			const space = await createSpace(org.id);

			const role = await spaceUserService.getUserSpaceRole(
				space.id,
				user.id!,
			);
			expect(role).toBeNull();
		});

		it('should grant admin access to platform SuperAdmin', async () => {
			const org = await createOrganization(ds);
			const space = await createSpace(org.id);

			const isAdmin = await spaceUserService.isUserSpaceAdmin(
				space.id,
				'any-user-id',
				UserRole.SuperAdmin,
			);
			expect(isAdmin).toBe(true);
		});

		it('should grant admin access to platform Admin', async () => {
			const org = await createOrganization(ds);
			const space = await createSpace(org.id);

			const isAdmin = await spaceUserService.isUserSpaceAdmin(
				space.id,
				'any-user-id',
				UserRole.Admin,
			);
			expect(isAdmin).toBe(true);
		});

		it('should detect space admin from SpaceUser role', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id, { role: UserRole.User });
			const space = await createSpace(org.id);

			await spaceUserService.addUserToSpace(
				space.id,
				user.id!,
				SpaceRole.SpaceAdmin,
			);

			const isAdmin = await spaceUserService.isUserSpaceAdmin(
				space.id,
				user.id!,
				UserRole.User,
			);
			expect(isAdmin).toBe(true);
		});
	});

	// ── hasSpaceAccess() ──────────────────────────────────────────────────────

	describe('hasSpaceAccess()', () => {
		it('should grant access to public spaces for any user', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id, { role: UserRole.User });
			const space = await createSpace(org.id, { isPublic: true });

			const access = await spaceUserService.hasSpaceAccess(
				space.id,
				user.id!,
				UserRole.User,
				true,
			);
			expect(access).toBe(true);
		});

		it('should deny access to private spaces for non-members', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id, { role: UserRole.User });
			const space = await createSpace(org.id, { isPublic: false });

			const access = await spaceUserService.hasSpaceAccess(
				space.id,
				user.id!,
				UserRole.User,
				false,
			);
			expect(access).toBe(false);
		});

		it('should grant access to private spaces for members', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id, { role: UserRole.User });
			const space = await createSpace(org.id, { isPublic: false });

			await spaceUserService.addUserToSpace(
				space.id,
				user.id!,
				SpaceRole.SpaceUser,
			);

			const access = await spaceUserService.hasSpaceAccess(
				space.id,
				user.id!,
				UserRole.User,
				false,
			);
			expect(access).toBe(true);
		});

		it('should grant access to private spaces for admins', async () => {
			const org = await createOrganization(ds);
			const space = await createSpace(org.id, { isPublic: false });

			const access = await spaceUserService.hasSpaceAccess(
				space.id,
				'any-user',
				UserRole.Admin,
				false,
			);
			expect(access).toBe(true);
		});
	});

	// ── updateUserRole() ──────────────────────────────────────────────────────

	describe('updateUserRole()', () => {
		it('should update a user role within a space', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id);
			const space = await createSpace(org.id);

			await spaceUserService.addUserToSpace(
				space.id,
				user.id!,
				SpaceRole.SpaceUser,
			);
			await spaceUserService.updateUserRole(
				space.id,
				user.id!,
				SpaceRole.SpaceAdmin,
			);

			const role = await spaceUserService.getUserSpaceRole(
				space.id,
				user.id!,
			);
			expect(role).toBe(SpaceRole.SpaceAdmin);
		});
	});

	// ── Cross-org isolation ───────────────────────────────────────────────────

	describe('Cross-org isolation', () => {
		it('should isolate spaces between organizations', async () => {
			const org1 = await createOrganization(ds);
			const org2 = await createOrganization(ds);
			await createSpace(org1.id, { name: 'Org1 Space' });
			await createSpace(org2.id, { name: 'Org2 Space' });

			const org1Spaces = await spaceService.findSpaces(org1.id);
			const org2Spaces = await spaceService.findSpaces(org2.id);

			expect(org1Spaces).toHaveLength(1);
			expect(org1Spaces[0].name).toBe('Org1 Space');
			expect(org2Spaces).toHaveLength(1);
			expect(org2Spaces[0].name).toBe('Org2 Space');
		});
	});
});
