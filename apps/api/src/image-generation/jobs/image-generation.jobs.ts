/**
 * Job name constants and type definitions for image generation processing.
 * Note: pg-boss queue processing has been replaced with direct orchestration calls
 * due to ESM compatibility issues with @wavezync/nestjs-pgboss.
 */

export const JOB_NAMES = {
	PROCESS_GENERATION_REQUEST: 'image-generation:process-request',
	PROCESS_DOCUMENT: 'image-generation:process-document',
} as const;

export interface ProcessRequestJobData {
	requestId: string;
	organizationId: string;
}

export interface ProcessDocumentJobData {
	documentId: string;
	agentId: string;
	s3Key: string;
	mimeType: string;
}
