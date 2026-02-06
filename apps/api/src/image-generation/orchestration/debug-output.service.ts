import * as fs from 'fs';
import * as path from 'path';

import { Injectable, Logger } from '@nestjs/common';

export interface DebugIterationData {
	iterationNumber: number;
	optimizedPrompt: string;
	images: {
		imageId: string;
		filePath?: string;
		mimeType: string;
		sizeBytes: number;
	}[];
	evaluations: {
		agentId: string;
		agentName: string;
		score: number;
		categoryScores?: Record<string, number>;
		feedback: string;
	}[];
	aggregateScore: number;
	selectedImageId: string;
	timestamp: string;
}

export interface DebugOrchestrationLog {
	requestId: string;
	organizationId: string;
	brief: string;
	threshold: number;
	maxIterations: number;
	judgeAgents: {
		id: string;
		name: string;
		weight: number;
	}[];
	iterations: DebugIterationData[];
	finalResult: {
		status: string;
		reason: string;
		finalScore: number;
		finalImageId: string;
		totalTimeMs: number;
	} | null;
	startedAt: string;
	completedAt?: string;
}

@Injectable()
export class DebugOutputService {
	private readonly logger = new Logger(DebugOutputService.name);
	private readonly enabled: boolean;
	private readonly outputDir: string;

	constructor() {
		this.enabled = process.env.IMAGE_GEN_DEBUG_OUTPUT === 'true';
		this.outputDir =
			process.env.IMAGE_GEN_DEBUG_DIR ||
			path.join(process.cwd(), 'debug-output');

		if (this.enabled) {
			this.logger.warn(
				`[DEBUG_OUTPUT] Enabled - saving to ${this.outputDir}`,
			);
			this.ensureDirectory(this.outputDir);
		}
	}

	/**
	 * Check if debug output is enabled
	 */
	public isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Initialize debug session for a request
	 */
	public initSession(
		requestId: string,
		organizationId: string,
		brief: string,
		threshold: number,
		maxIterations: number,
		judgeAgents: { id: string; name: string; weight: number }[],
	): DebugOrchestrationLog {
		if (!this.enabled) {
			return {} as DebugOrchestrationLog;
		}

		const sessionDir = this.getSessionDir(requestId);
		this.ensureDirectory(sessionDir);
		this.ensureDirectory(path.join(sessionDir, 'images'));

		const log: DebugOrchestrationLog = {
			requestId,
			organizationId,
			brief,
			threshold,
			maxIterations,
			judgeAgents,
			iterations: [],
			finalResult: null,
			startedAt: new Date().toISOString(),
		};

		this.writeJson(path.join(sessionDir, 'orchestration.json'), log);
		this.logger.log(`[DEBUG_OUTPUT] Session initialized: ${sessionDir}`);

		return log;
	}

	/**
	 * Save an image to the debug output directory
	 */
	public saveImage(
		requestId: string,
		iterationNumber: number,
		imageId: string,
		imageData: Buffer,
		mimeType: string,
	): string | null {
		if (!this.enabled) {
			return null;
		}

		const ext = mimeType.includes('png') ? 'png' : 'jpg';
		const filename = `iter${iterationNumber}_${imageId}.${ext}`;
		const filePath = path.join(
			this.getSessionDir(requestId),
			'images',
			filename,
		);

		fs.writeFileSync(filePath, imageData);
		this.logger.debug(
			`[DEBUG_OUTPUT] Saved image: ${filename} (${imageData.length} bytes)`,
		);

		return filePath;
	}

	/**
	 * Save iteration data
	 */
	public saveIteration(
		requestId: string,
		iteration: DebugIterationData,
	): void {
		if (!this.enabled) {
			return;
		}

		const sessionDir = this.getSessionDir(requestId);
		const logPath = path.join(sessionDir, 'orchestration.json');

		try {
			const log: DebugOrchestrationLog = JSON.parse(
				fs.readFileSync(logPath, 'utf-8'),
			);
			log.iterations.push(iteration);
			this.writeJson(logPath, log);

			// Also save individual iteration file for easy access
			this.writeJson(
				path.join(
					sessionDir,
					`iteration_${iteration.iterationNumber}.json`,
				),
				iteration,
			);

			this.logger.log(
				`[DEBUG_OUTPUT] Saved iteration ${iteration.iterationNumber} | ` +
					`Score: ${iteration.aggregateScore.toFixed(2)}`,
			);
		} catch (error) {
			this.logger.error(
				`[DEBUG_OUTPUT] Failed to save iteration: ${error}`,
			);
		}
	}

	/**
	 * Save final result
	 */
	public saveFinalResult(
		requestId: string,
		status: string,
		reason: string,
		finalScore: number,
		finalImageId: string,
		totalTimeMs: number,
	): void {
		if (!this.enabled) {
			return;
		}

		const sessionDir = this.getSessionDir(requestId);
		const logPath = path.join(sessionDir, 'orchestration.json');

		try {
			const log: DebugOrchestrationLog = JSON.parse(
				fs.readFileSync(logPath, 'utf-8'),
			);
			log.finalResult = {
				status,
				reason,
				finalScore,
				finalImageId,
				totalTimeMs,
			};
			log.completedAt = new Date().toISOString();
			this.writeJson(logPath, log);

			// Create a summary file
			const summary = {
				requestId,
				status,
				reason,
				finalScore,
				finalImageId,
				iterationCount: log.iterations.length,
				totalTimeMs,
				startedAt: log.startedAt,
				completedAt: log.completedAt,
			};
			this.writeJson(path.join(sessionDir, 'summary.json'), summary);

			this.logger.log(
				`[DEBUG_OUTPUT] Saved final result: ${status} | ` +
					`Score: ${finalScore.toFixed(2)} | ` +
					`Iterations: ${log.iterations.length}`,
			);
		} catch (error) {
			this.logger.error(
				`[DEBUG_OUTPUT] Failed to save final result: ${error}`,
			);
		}
	}

	/**
	 * Get the session directory for a request
	 */
	private getSessionDir(requestId: string): string {
		const timestamp = new Date().toISOString().split('T')[0];
		return path.join(this.outputDir, `${timestamp}_${requestId}`);
	}

	/**
	 * Ensure a directory exists
	 */
	private ensureDirectory(dir: string): void {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}

	/**
	 * Write JSON to file with pretty formatting
	 */
	private writeJson(filePath: string, data: any): void {
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
	}
}
