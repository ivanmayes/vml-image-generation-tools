import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { DataSource } from 'typeorm';
import { User } from '../../src/user/user.entity';

/**
 * Test RSA key pair — generated once per process for JWT signing.
 * These keys are only used in tests; production uses env vars.
 */
let _testKeyPair: { publicKey: string; privateKey: string } | null = null;

export function getTestKeyPair(): { publicKey: string; privateKey: string } {
	if (!_testKeyPair) {
		const pair = generateKeyPairSync('rsa', {
			modulusLength: 2048,
			publicKeyEncoding: { type: 'spki', format: 'pem' },
			privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
		});
		_testKeyPair = pair;
	}
	return _testKeyPair;
}

/**
 * Set the test key pair into process.env so NestJS JwtModule picks them up.
 * Call this in global-setup or beforeAll.
 */
export function setTestJwtEnv(): void {
	const { publicKey, privateKey } = getTestKeyPair();
	process.env.PUBLIC_KEY = publicKey;
	process.env.PRIVATE_KEY = privateKey;
}

/**
 * Generate a valid JWT for a test user and store it in the user's authTokens.
 *
 * @param ds   DataSource (must be connected)
 * @param user The user entity (must already be persisted with an id)
 * @returns    The signed JWT string
 */
export async function getAuthToken(
	ds: DataSource,
	user: User,
): Promise<string> {
	const { privateKey } = getTestKeyPair();

	const payload = {
		id: user.id,
		email: user.email,
		emailNormalized: user.emailNormalized,
		role: user.role,
	};

	const token = jwt.sign(payload, privateKey, {
		algorithm: 'RS256',
		expiresIn: '1h',
	});

	// Store the token in the user's authTokens array so validateUser() passes
	const repo = ds.getRepository(User);
	const currentTokens = user.authTokens ?? [];
	await repo.update(user.id!, { authTokens: [...currentTokens, token] });

	return token;
}
