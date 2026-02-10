import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

import { User } from '../../src/user/user.entity';
import { UserService } from '../../src/user/user.service';
import { AuthService } from '../../src/user/auth/auth.service';
import { TestDatabaseManager } from '../test-database.config';
import { createOrganization, createUser } from '../factories';

/**
 * AuthService Integration Tests
 *
 * Tests hit a REAL PostgreSQL database. Zero mocks.
 * JwtService is instantiated with a test secret for token operations.
 */
describe('AuthService (Integration)', () => {
	let dbManager: TestDatabaseManager;
	let ds: DataSource;
	let authService: AuthService;
	let userService: UserService;
	let jwtService: JwtService;
	let userRepo: Repository<User>;

	const JWT_SECRET = 'test-jwt-secret-for-integration-tests';

	beforeAll(async () => {
		console.log('[AuthService] Initializing test database...');
		dbManager = new TestDatabaseManager();
		ds = await dbManager.initialize();
		console.log('[AuthService] DB connected.');

		userRepo = ds.getRepository(User);
		userService = new UserService(userRepo, ds);
		jwtService = new JwtService({
			secret: JWT_SECRET,
			signOptions: { expiresIn: '1h' },
		});
		authService = new AuthService(userService, jwtService, ds);
	});

	beforeEach(async () => {
		console.log('[AuthService] Truncating tables...');
		await dbManager.reset();
	});

	afterAll(async () => {
		console.log('[AuthService] Closing database connection...');
		await dbManager.destroy();
	});

	// ── Token lifecycle ───────────────────────────────────────────────────────

	describe('Token lifecycle', () => {
		it('should validate a user with a valid token in authTokens', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id, {
				deactivated: false,
			});

			// Generate a JWT token
			const token = jwtService.sign({ id: user.id!, email: user.email });

			// Store the token in the user's authTokens
			user.authTokens = [token];
			await userRepo.save(user);

			// Validate
			const validated = await authService.validateUser(token, {
				id: user.id!,
			} as any);

			expect(validated).not.toBeNull();
			expect(validated.id).toBe(user.id);
		});

		it('should reject a deactivated user', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id, {
				deactivated: true,
			});

			const token = jwtService.sign({ id: user.id!, email: user.email });
			user.authTokens = [token];
			await userRepo.save(user);

			await expect(
				authService.validateUser(token, { id: user.id! } as any),
			).rejects.toThrow('Access denied');
		});

		it('should reject a revoked token', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id, {
				deactivated: false,
			});

			const token = jwtService.sign({ id: user.id!, email: user.email });
			// Store a DIFFERENT token
			user.authTokens = ['different-token'];
			await userRepo.save(user);

			await expect(
				authService.validateUser(token, { id: user.id! } as any),
			).rejects.toThrow('Token has been revoked');
		});
	});

	// ── removeAuthTokens() ────────────────────────────────────────────────────

	describe('removeAuthTokens()', () => {
		it('should remove a specific token from user authTokens', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id);

			const token1 = jwtService.sign({ id: user.id!, session: '1' });
			const token2 = jwtService.sign({ id: user.id!, session: '2' });
			user.authTokens = [token1, token2];
			await userRepo.save(user);

			await authService.removeAuthTokens(user.id!, token1);

			const refreshed = await userRepo.findOne({
				where: { id: user.id! },
			});
			expect(refreshed!.authTokens).toHaveLength(1);
			expect(refreshed!.authTokens).not.toContain(token1);
			expect(refreshed!.authTokens).toContain(token2);
		});
	});

	// ── cleanAuthTokens() ─────────────────────────────────────────────────────

	describe('cleanAuthTokens()', () => {
		it('should remove expired tokens from authTokens', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id);

			const validToken = jwtService.sign(
				{ id: user.id! },
				{ expiresIn: '1h' },
			);
			const expiredToken = jwtService.sign(
				{ id: user.id! },
				{ expiresIn: '0s' },
			);

			// Wait a moment so the expired token is actually expired
			await new Promise((resolve) => setTimeout(resolve, 100));

			user.authTokens = [validToken, expiredToken];
			await userRepo.save(user);

			await authService.cleanAuthTokens(user.id!);

			const refreshed = await userRepo.findOne({
				where: { id: user.id! },
			});
			expect(refreshed!.authTokens).toHaveLength(1);
			expect(refreshed!.authTokens).toContain(validToken);
		});

		it('should throw for non-existent user', async () => {
			await expect(
				authService.cleanAuthTokens(
					'00000000-0000-4000-8000-000000000099',
				),
			).rejects.toThrow('User not found');
		});
	});

	// ── replaceToken() ────────────────────────────────────────────────────────

	describe('replaceToken()', () => {
		it('should replace an old token with a new one', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id);

			const oldToken = jwtService.sign({ id: user.id!, v: 'old' });
			const newToken = jwtService.sign({ id: user.id!, v: 'new' });

			user.authTokens = [oldToken];
			await userRepo.save(user);

			await authService.replaceToken(user.id!, oldToken, newToken);

			const refreshed = await userRepo.findOne({
				where: { id: user.id! },
			});
			expect(refreshed!.authTokens).toContain(newToken);
			expect(refreshed!.authTokens).not.toContain(oldToken);
		});
	});

	// ── generateSinglePass() / validatePass() ────────────────────────────────

	describe('generateSinglePass() / validatePass()', () => {
		it('should generate and validate a single-use pass code', async () => {
			// Set required env vars for pass generation
			process.env.SINGLE_PASS_LENGTH =
				process.env.SINGLE_PASS_LENGTH || '8';

			const [pass, hash, expire] = await authService.generateSinglePass();

			expect(pass).toBeDefined();
			expect(typeof pass).toBe('string');
			expect(hash).toBeDefined();
			expect(expire).toBeDefined();

			// Validate the pass against the hash
			if (typeof hash === 'string') {
				const isValid = await authService.validatePass(
					pass as string,
					hash,
				);
				expect(isValid).toBe(true);
			}
		});

		it('should reject invalid password against hash', async () => {
			const [_pass, hash] = await authService.generateSinglePass();

			if (typeof hash === 'string') {
				const isValid = await authService.validatePass(
					'wrong-password',
					hash,
				);
				expect(isValid).toBe(false);
			}
		});
	});
});
