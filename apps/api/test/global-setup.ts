import { generateKeyPairSync } from 'crypto';

/**
 * Jest global setup — runs once before all test suites.
 *
 * 1. Creates the test database if it doesn't exist.
 * 2. Sets up test JWT key pair in environment variables.
 */
export default async function globalSetup(): Promise<void> {
	const dbUrl =
		process.env.TEST_DATABASE_URL ??
		'postgres://postgres:postgres@localhost:5432/vml_test';

	const parsed = new URL(dbUrl);
	const dbName = parsed.pathname.replace('/', '');

	// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
	const pg = require('pg');
	const Client = pg.Client;

	// Connect to the default 'postgres' database to create the test DB
	const adminUrl = `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}/postgres`;
	const client = new Client({ connectionString: adminUrl });

	try {
		await client.connect();

		const result = await client.query(
			`SELECT 1 FROM pg_database WHERE datname = $1`,
			[dbName],
		);

		if (result.rowCount === 0) {
			await client.query(`CREATE DATABASE "${dbName}"`);
			console.log(`[global-setup] Created test database: ${dbName}`);
		} else {
			console.log(
				`[global-setup] Test database already exists: ${dbName}`,
			);
		}
	} finally {
		await client.end();
	}

	// Generate and set test JWT keys
	const pair = generateKeyPairSync('rsa', {
		modulusLength: 2048,
		publicKeyEncoding: { type: 'spki', format: 'pem' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	});
	process.env.PUBLIC_KEY = pair.publicKey;
	process.env.PRIVATE_KEY = pair.privateKey;
	process.env.DATABASE_URL = dbUrl;
	process.env.DATABASE_TYPE = 'postgres';
	process.env.DATABASE_SYNCHRONIZE = 'true';
	process.env.NODE_ENV = 'test';

	console.log('[global-setup] Test environment configured.');
}
