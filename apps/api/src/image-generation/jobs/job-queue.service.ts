import { Injectable, Logger } from '@nestjs/common';

const MAX_CONCURRENT = 3;

/**
 * Simple job queue service that executes orchestration asynchronously.
 * This bypasses pg-boss ESM compatibility issues by running orchestration directly.
 */
@Injectable()
export class JobQueueService {
	private readonly logger = new Logger(JobQueueService.name);
	private orchestrationService: any; // Lazy loaded to avoid circular dependency
	private readonly activeRequests = new Map<string, boolean>();
	private readonly cancelledRequests = new Set<string>();

	/**
	 * Set the orchestration service reference (called by module)
	 */
	public setOrchestrationService(service: any): void {
		this.orchestrationService = service;
	}

	/**
	 * Cancel a running generation request.
	 * The orchestration loop checks this at each iteration boundary.
	 */
	public cancelRequest(requestId: string): void {
		this.cancelledRequests.add(requestId);
		this.logger.log(`[CANCEL_REQUESTED] RequestID: ${requestId}`);
	}

	/**
	 * Check if a request has been cancelled
	 */
	public isCancelled(requestId: string): boolean {
		return this.cancelledRequests.has(requestId);
	}

	/**
	 * Get the number of currently active orchestrations
	 */
	public getActiveCount(): number {
		return this.activeRequests.size;
	}

	/**
	 * Queue a generation request for processing
	 * Runs the orchestration asynchronously without blocking
	 */
	public async queueGenerationRequest(
		requestId: string,
		organizationId: string,
	): Promise<void> {
		this.logger.log(
			`[QUEUE_REQUEST] RequestID: ${requestId} | OrgID: ${organizationId} | ` +
				`Active: ${this.activeRequests.size}/${MAX_CONCURRENT}`,
		);

		if (!this.orchestrationService) {
			throw new Error(
				'OrchestrationService not initialized. Call setOrchestrationService first.',
			);
		}

		if (this.activeRequests.size >= MAX_CONCURRENT) {
			this.logger.warn(
				`[QUEUE_FULL] Max concurrent requests (${MAX_CONCURRENT}) reached. ` +
					`RequestID: ${requestId} rejected.`,
			);
			throw new Error(
				`Too many concurrent generation requests (max ${MAX_CONCURRENT}). Try again later.`,
			);
		}

		this.activeRequests.set(requestId, true);

		// Execute orchestration asynchronously (fire and forget)
		setImmediate(async () => {
			try {
				this.logger.log(
					`[QUEUE_EXECUTING] RequestID: ${requestId} - Starting orchestration`,
				);
				await this.orchestrationService.executeRequest(requestId);
				this.logger.log(
					`[QUEUE_COMPLETE] RequestID: ${requestId} - Orchestration finished`,
				);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'Unknown error';
				this.logger.error(
					`[QUEUE_ERROR] RequestID: ${requestId} - Orchestration failed: ${message}`,
				);
			} finally {
				this.activeRequests.delete(requestId);
				this.cancelledRequests.delete(requestId);
				this.logger.debug(
					`[QUEUE_CLEANUP] RequestID: ${requestId} | ` +
						`RemainingActive: ${this.activeRequests.size}`,
				);
			}
		});

		this.logger.log(
			`[QUEUE_SCHEDULED] RequestID: ${requestId} - Queued for processing`,
		);
	}

	/**
	 * Queue a document for processing
	 * For now, this is a placeholder - document processing can be added later
	 */
	public async queueDocumentProcessing(
		documentId: string,
		agentId: string,
		s3Key: string,
		_mimeType: string,
	): Promise<void> {
		this.logger.log(
			`[QUEUE_DOCUMENT] DocID: ${documentId} | AgentID: ${agentId} | S3Key: ${s3Key}`,
		);

		// Document processing runs synchronously for now
		this.logger.warn(
			`[QUEUE_DOCUMENT] Document processing not yet implemented async`,
		);
	}
}
