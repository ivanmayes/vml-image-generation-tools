import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
	createTestApp,
	TestLogger,
	createTestRequest,
	setTestJwtEnv,
} from '../helpers';

describe('App Health Check (E2E Real)', () => {
	let app: INestApplication;
	let dataSource: DataSource;
	let logger: TestLogger;

	beforeAll(async () => {
		setTestJwtEnv();
		const result = await createTestApp();
		app = result.app;
		dataSource = result.dataSource;
		logger = new TestLogger('App Health Check');
	});

	afterAll(async () => {
		logger.endSuite();
		logger.flush();
		await app.close();
	});

	beforeEach(() => {
		logger.startTest(expect.getState().currentTestName ?? 'unknown');
	});

	afterEach(() => {
		const passed =
			!expect.getState().numPassingAsserts ||
			expect.getState().numPassingAsserts > 0;
		logger.endTest(passed);
	});

	it('GET / should return Hello There!', async () => {
		const req = createTestRequest(app, logger);
		const res = await req.get('/').expect(200);

		logger.logAssertion('response.status === 200', res.status === 200);
		expect(res.status).toBe(200);

		logger.logAssertion(
			'response.text === "Hello There!"',
			res.text === 'Hello There!',
		);
		expect(res.text).toBe('Hello There!');
	});

	it('GET /health should return ok status', async () => {
		const req = createTestRequest(app, logger);
		const res = await req.get('/health').expect(200);

		logger.logAssertion('response.status === 200', res.status === 200);
		expect(res.status).toBe(200);

		logger.logAssertion('body.status === "ok"', res.body.status === 'ok');
		expect(res.body.status).toBe('ok');

		logger.logAssertion('body.timestamp is defined', !!res.body.timestamp);
		expect(res.body.timestamp).toBeDefined();
	});

	it('GET /nonexistent should return 404', async () => {
		const req = createTestRequest(app, logger);
		const res = await req.get('/this-route-does-not-exist').expect(404);

		logger.logAssertion('response.status === 404', res.status === 404);
		expect(res.status).toBe(404);
	});

	it('app should have DataSource connected', () => {
		logger.logAssertion(
			'DataSource is initialized',
			dataSource.isInitialized,
		);
		expect(dataSource.isInitialized).toBe(true);
	});
});
