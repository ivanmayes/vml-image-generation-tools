/**
 * TestLogger — structured, rich test logging for integration and E2E tests.
 *
 * Captures:
 *  - Suite / test lifecycle (start, end, duration)
 *  - HTTP request/response details (method, URL, status, body, timing)
 *  - Database query counts and timing
 *  - Assertion context
 */
export class TestLogger {
	private suiteName: string;
	private testName: string | null = null;
	private testStart: number = 0;
	private suiteStart: number = 0;
	private queryCount: number = 0;
	private queryTimeMs: number = 0;
	private logs: string[] = [];

	constructor(suiteName: string) {
		this.suiteName = suiteName;
		this.suiteStart = Date.now();
		this.log('SUITE_START', { suite: suiteName });
	}

	/**
	 * Call at the start of each test (in beforeEach).
	 */
	startTest(testName: string): void {
		this.testName = testName;
		this.testStart = Date.now();
		this.queryCount = 0;
		this.queryTimeMs = 0;
		this.log('TEST_START', { test: testName });
	}

	/**
	 * Call at the end of each test (in afterEach).
	 */
	endTest(passed: boolean): void {
		const duration = Date.now() - this.testStart;
		this.log('TEST_END', {
			test: this.testName,
			passed,
			durationMs: duration,
			dbQueries: this.queryCount,
			dbTimeMs: this.queryTimeMs,
		});
		this.testName = null;
	}

	/**
	 * Log an HTTP request/response pair.
	 */
	logHttp(detail: {
		method: string;
		url: string;
		status: number;
		requestBody?: unknown;
		responseBody?: unknown;
		durationMs: number;
	}): void {
		this.log('HTTP', detail);
	}

	/**
	 * Track a database query.
	 */
	logQuery(query: string, durationMs: number): void {
		this.queryCount++;
		this.queryTimeMs += durationMs;
		this.log('DB_QUERY', {
			query: query.substring(0, 200),
			durationMs,
			totalQueries: this.queryCount,
		});
	}

	/**
	 * Log an assertion with context.
	 */
	logAssertion(description: string, passed: boolean, detail?: unknown): void {
		this.log('ASSERTION', { description, passed, detail });
	}

	/**
	 * Log an arbitrary event.
	 */
	logInfo(message: string, detail?: unknown): void {
		this.log('INFO', { message, detail });
	}

	/**
	 * Log an error.
	 */
	logError(message: string, error?: unknown): void {
		this.log('ERROR', {
			message,
			error:
				error instanceof Error
					? {
							name: error.name,
							message: error.message,
							stack: error.stack,
						}
					: error,
		});
	}

	/**
	 * End the suite and print summary.
	 */
	endSuite(): void {
		const duration = Date.now() - this.suiteStart;
		this.log('SUITE_END', { suite: this.suiteName, durationMs: duration });
	}

	/**
	 * Get all collected log lines (for assertions or output).
	 */
	getLogs(): string[] {
		return [...this.logs];
	}

	/**
	 * Print all logs to stdout (call in afterAll if desired).
	 */
	flush(): void {
		for (const line of this.logs) {
			process.stdout.write(line + '\n');
		}
	}

	private log(type: string, data: unknown): void {
		const entry = JSON.stringify({
			timestamp: new Date().toISOString(),
			suite: this.suiteName,
			test: this.testName,
			type,
			data,
		});
		this.logs.push(entry);

		// Also write to stdout immediately for real-time visibility
		const color =
			type === 'ERROR'
				? '\x1b[31m'
				: type === 'HTTP'
					? '\x1b[36m'
					: '\x1b[90m';
		const reset = '\x1b[0m';
		process.stdout.write(
			`${color}[TEST:${type}]${reset} ${this.formatCompact(type, data)}\n`,
		);
	}

	private formatCompact(type: string, data: unknown): string {
		const d = data as Record<string, unknown>;
		switch (type) {
			case 'TEST_START':
				return `${d['test']}`;
			case 'TEST_END':
				return `${d['test']} ${d['passed'] ? 'PASS' : 'FAIL'} (${d['durationMs']}ms, ${d['dbQueries']} queries)`;
			case 'HTTP':
				return `${d['method']} ${d['url']} -> ${d['status']} (${d['durationMs']}ms)`;
			case 'ASSERTION':
				return `${d['passed'] ? 'OK' : 'FAIL'}: ${d['description']}`;
			case 'SUITE_START':
			case 'SUITE_END':
				return `${d['suite']}${d['durationMs'] ? ` (${d['durationMs']}ms)` : ''}`;
			default:
				return JSON.stringify(d);
		}
	}
}
