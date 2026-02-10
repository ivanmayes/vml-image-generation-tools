import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { TestLogger } from './test-logger.helper';

/**
 * Wrap supertest with automatic logging via TestLogger.
 *
 * Usage:
 *   const req = createTestRequest(app, logger);
 *   const res = await req.get('/api/users').auth(token);
 */
export function createTestRequest(app: INestApplication, logger?: TestLogger) {
	const server = app.getHttpServer();

	return {
		get: (url: string) =>
			wrapRequest(supertest.default(server).get(url), 'GET', url, logger),
		post: (url: string) =>
			wrapRequest(
				supertest.default(server).post(url),
				'POST',
				url,
				logger,
			),
		put: (url: string) =>
			wrapRequest(supertest.default(server).put(url), 'PUT', url, logger),
		patch: (url: string) =>
			wrapRequest(
				supertest.default(server).patch(url),
				'PATCH',
				url,
				logger,
			),
		delete: (url: string) =>
			wrapRequest(
				supertest.default(server).delete(url),
				'DELETE',
				url,
				logger,
			),
	};
}

/**
 * A logged supertest request wrapper with auth convenience.
 */
interface LoggedRequest {
	auth(token: string): LoggedRequest;
	send(body: unknown): LoggedRequest;
	set(header: string, value: string): LoggedRequest;
	query(params: Record<string, string>): LoggedRequest;
	expect(status: number): Promise<supertest.Response>;
	then(
		resolve: (res: supertest.Response) => void,
		reject?: (err: unknown) => void,
	): Promise<void>;
}

function wrapRequest(
	req: supertest.Test,
	method: string,
	url: string,
	logger?: TestLogger,
): LoggedRequest {
	const startTime = Date.now();
	let requestBody: unknown;

	const wrapped: LoggedRequest = {
		auth(token: string) {
			req.set('Authorization', `Bearer ${token}`);
			return wrapped;
		},
		send(body: unknown) {
			requestBody = body;
			req.send(body as object);
			return wrapped;
		},
		set(header: string, value: string) {
			req.set(header, value);
			return wrapped;
		},
		query(params: Record<string, string>) {
			req.query(params);
			return wrapped;
		},
		async expect(status: number): Promise<supertest.Response> {
			const res = await req.expect(status);
			if (logger) {
				logger.logHttp({
					method,
					url,
					status: res.status,
					requestBody,
					responseBody: res.body,
					durationMs: Date.now() - startTime,
				});
			}
			return res;
		},
		then(resolve, reject) {
			return req.then((res) => {
				if (logger) {
					logger.logHttp({
						method,
						url,
						status: res.status,
						requestBody,
						responseBody: res.body,
						durationMs: Date.now() - startTime,
					});
				}
				resolve(res);
			}, reject);
		},
	};

	return wrapped;
}
