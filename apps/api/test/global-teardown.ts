/**
 * Jest global teardown — runs once after all test suites.
 *
 * Drops the test database to keep the dev environment clean.
 * Set TEST_KEEP_DB=true to skip teardown (useful for debugging).
 */
export default async function globalTeardown(): Promise<void> {
	if (process.env.TEST_KEEP_DB === 'true') {
		console.log('[global-teardown] TEST_KEEP_DB=true, skipping DB drop.');
		return;
	}

	const dbUrl =
		process.env.TEST_DATABASE_URL ??
		'postgres://postgres:postgres@localhost:5432/vml_test';

	const parsed = new URL(dbUrl);
	const dbName = parsed.pathname.replace('/', '');

	// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
	const pg = require('pg');
	const Client = pg.Client;

	const adminUrl = `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}/postgres`;
	const client = new Client({ connectionString: adminUrl });

	try {
		await client.connect();

		// Terminate any remaining connections to the test DB
		await client.query(
			`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
			[dbName],
		);

		await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
		console.log(`[global-teardown] Dropped test database: ${dbName}`);
	} catch (err) {
		console.error('[global-teardown] Error dropping test DB:', err);
	} finally {
		await client.end();
	}
}
