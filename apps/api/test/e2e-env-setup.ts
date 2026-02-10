/**
 * Jest setup file that runs BEFORE test files are loaded.
 * Sets environment variables so that database.module.ts
 * connects to the test database instead of the .env database.
 */
import { generateKeyPairSync } from 'crypto';

const testDbUrl =
	process.env.TEST_DATABASE_URL ??
	'postgres://postgres:postgres@localhost:5432/vml_test';

process.env.DATABASE_URL = testDbUrl;
process.env.DATABASE_TYPE = 'postgres';
process.env.DATABASE_SYNCHRONIZE = 'true';
process.env.DATABASE_SSL = '';
process.env.DATABASE_MIGRATE_ON_STARTUP = 'false';
process.env.NODE_ENV = 'test';

// Generate RSA key pair for JWT if not already set
if (!process.env.PRIVATE_KEY) {
	const pair = generateKeyPairSync('rsa', {
		modulusLength: 2048,
		publicKeyEncoding: { type: 'spki', format: 'pem' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	});
	process.env.PUBLIC_KEY = pair.publicKey as string;
	process.env.PRIVATE_KEY = pair.privateKey as string;
}

// Set dummy API keys for services that validate on startup
// These are never actually called in E2E tests
process.env.GOOGLE_GENAI_API_KEY =
	process.env.GOOGLE_GENAI_API_KEY || 'test-dummy-key-not-real';
process.env.GEMINI_API_KEY =
	process.env.GEMINI_API_KEY || 'test-dummy-key-not-real';
process.env.OPENAI_API_KEY =
	process.env.OPENAI_API_KEY || 'test-dummy-key-not-real';
process.env.ANTHROPIC_API_KEY =
	process.env.ANTHROPIC_API_KEY || 'test-dummy-key-not-real';
process.env.SENDGRID_API_KEY =
	process.env.SENDGRID_API_KEY || 'test-dummy-key-not-real';
process.env.AWS_ACCESS_KEY_ID =
	process.env.AWS_ACCESS_KEY_ID || 'test-dummy-key';
process.env.AWS_SECRET_ACCESS_KEY =
	process.env.AWS_SECRET_ACCESS_KEY || 'test-dummy-secret';
process.env.AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || 'test-bucket';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';

console.log(`[e2e-env-setup] DATABASE_URL = ${testDbUrl}`);
