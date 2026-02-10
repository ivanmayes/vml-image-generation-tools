import { DataSource } from 'typeorm';
import path from 'path';

/**
 * TestDatabaseManager — manages a real PostgreSQL connection for tests.
 *
 * Usage:
 *   const db = new TestDatabaseManager();
 *   await db.initialize();       // connect + synchronize schema
 *   await db.reset();            // TRUNCATE all tables between tests
 *   await db.destroy();          // close connection
 */
export class TestDatabaseManager {
	private _dataSource: DataSource | null = null;

	get dataSource(): DataSource {
		if (!this._dataSource || !this._dataSource.isInitialized) {
			throw new Error(
				'TestDatabaseManager: DataSource not initialized. Call initialize() first.',
			);
		}
		return this._dataSource;
	}

	/**
	 * Connect to the test database and synchronize the schema.
	 */
	async initialize(): Promise<DataSource> {
		const url =
			process.env.TEST_DATABASE_URL ??
			'postgres://postgres:postgres@localhost:5432/vml_test';

		this._dataSource = new DataSource({
			type: 'postgres',
			url,
			entities: [path.resolve(__dirname, '../src/**/*.entity{.ts,.js}')],
			synchronize: true,
			logging: process.env.TEST_DB_LOGGING === 'true',
			dropSchema: false,
		});

		await this._dataSource.initialize();
		return this._dataSource;
	}

	/**
	 * TRUNCATE every user-created table (CASCADE) to reset state between tests.
	 */
	async reset(): Promise<void> {
		const ds = this.dataSource;
		const entities = ds.entityMetadatas;

		if (entities.length === 0) return;

		const tableNames = entities.map((e) => `"${e.tableName}"`).join(', ');

		await ds.query(`TRUNCATE TABLE ${tableNames} CASCADE`);
	}

	/**
	 * Drop all tables (for full cleanup, e.g. global teardown).
	 */
	async dropAllTables(): Promise<void> {
		const ds = this.dataSource;
		await ds.dropDatabase();
	}

	/**
	 * Close the connection.
	 */
	async destroy(): Promise<void> {
		if (this._dataSource?.isInitialized) {
			await this._dataSource.destroy();
			this._dataSource = null;
		}
	}
}
