import { DataSource } from 'typeorm';
import { User } from '../../src/user/user.entity';
import { UserRole } from '../../src/user/user-role.enum';

let userCounter = 0;

/**
 * Create and persist a real User entity.
 * Requires an existing organizationId.
 */
export async function createUser(
	ds: DataSource,
	organizationId: string,
	overrides: Partial<User> = {},
): Promise<User> {
	userCounter++;
	const repo = ds.getRepository(User);

	const email =
		overrides.email ?? `testuser${userCounter}-${Date.now()}@test.com`;

	const user = repo.create({
		email,
		emailNormalized: email.toLowerCase(),
		organizationId,
		role: UserRole.Admin,
		deactivated: false,
		profile: {
			nameFirst: 'Test',
			nameLast: `User${userCounter}`,
		},
		authTokens: [],
		...overrides,
	});

	return repo.save(user);
}
