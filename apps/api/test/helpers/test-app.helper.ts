import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Create a real NestJS test application connected to the test database.
 *
 * Sets all required env vars BEFORE importing AppModule so that
 * database.module.ts picks up the test database URL.
 *
 * Requires PRIVATE_KEY/PUBLIC_KEY to be set first via setTestJwtEnv().
 */
export async function createTestApp(): Promise<{
	app: INestApplication;
	module: TestingModule;
	dataSource: DataSource;
}> {
	// Set env vars BEFORE importing AppModule
	const testDbUrl =
		process.env.TEST_DATABASE_URL ??
		'postgres://postgres:postgres@localhost:5432/vml_test';

	// These must be set before AppModule is imported because
	// database.module.ts reads them at import time
	process.env.DATABASE_URL = testDbUrl;
	process.env.DATABASE_TYPE = 'postgres';
	process.env.DATABASE_SYNCHRONIZE = 'true';
	process.env.DATABASE_SSL = '';
	process.env.DATABASE_MIGRATE_ON_STARTUP = 'false';
	process.env.NODE_ENV = 'test';

	// Clear module cache for database.module to re-read env vars
	const dbModulePath = require.resolve('../../src/database.module');
	delete require.cache[dbModulePath];
	const appModulePath = require.resolve('../../src/app.module');
	delete require.cache[appModulePath];

	// Now import AppModule — it will read the updated env vars
	const { AppModule } = await import('../../src/app.module');

	const module = await Test.createTestingModule({
		imports: [AppModule],
	}).compile();

	const app = module.createNestApplication();

	// Apply the same validation pipe as the real app
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
			forbidNonWhitelisted: true,
		}),
	);

	await app.init();

	const dataSource = module.get(DataSource);

	return { app, module, dataSource };
}
