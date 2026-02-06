/**
 * Generation request types for the web application.
 *
 * Interfaces match the backend entity toPublic()/toDetailed() responses.
 */

export enum GenerationRequestStatus {
	PENDING = 'pending',
	OPTIMIZING = 'optimizing',
	GENERATING = 'generating',
	EVALUATING = 'evaluating',
	COMPLETED = 'completed',
	FAILED = 'failed',
	CANCELLED = 'cancelled',
}

export enum CompletionReason {
	SUCCESS = 'SUCCESS',
	MAX_RETRIES_REACHED = 'MAX_RETRIES_REACHED',
	DIMINISHING_RETURNS = 'DIMINISHING_RETURNS',
	CANCELLED = 'CANCELLED',
	ERROR = 'ERROR',
}

export interface ImageParams {
	aspectRatio?: string;
	quality?: string;
	imagesPerGeneration: number;
	plateauWindowSize?: number;
	plateauThreshold?: number;
}

export interface RequestCosts {
	llmTokens: number;
	imageGenerations: number;
	embeddingTokens: number;
	totalEstimatedCost: number;
}

export interface TopIssueSnapshot {
	problem: string;
	severity: 'critical' | 'major' | 'moderate' | 'minor';
	fix: string;
}

export interface AgentEvaluationSnapshot {
	agentId: string;
	agentName: string;
	imageId: string;
	overallScore: number;
	categoryScores?: Record<string, number>;
	feedback: string;
	weight: number;
	topIssue?: TopIssueSnapshot;
	whatWorked?: string[];
	checklist?: Record<string, { passed: boolean; note?: string }>;
}

export interface IterationSnapshot {
	iterationNumber: number;
	optimizedPrompt: string;
	selectedImageId?: string;
	aggregateScore: number;
	evaluations: AgentEvaluationSnapshot[];
	createdAt: string;
}

// Matches toPublic() response
export interface GenerationRequestPublic {
	id: string;
	organizationId: string;
	projectId?: string;
	spaceId?: string;
	brief: string;
	status: GenerationRequestStatus;
	currentIteration: number;
	maxIterations: number;
	threshold: number;
	finalImageId?: string;
	completionReason?: CompletionReason;
	costs: RequestCosts;
	createdAt: string;
	completedAt?: string;
}

// Matches toDetailed() response (extends public)
export interface GenerationRequestDetailed extends GenerationRequestPublic {
	initialPrompt?: string;
	referenceImageUrls?: string[];
	negativePrompts?: string;
	judgeIds: string[];
	imageParams: ImageParams;
	iterations: IterationSnapshot[];
	errorMessage?: string;
}

// Generated image matching API response
export interface GeneratedImage {
	id: string;
	requestId: string;
	iterationNumber: number;
	imageUrl: string;
	prompt: string;
	createdAt: string;
}

// SSE event types
export enum GenerationEventType {
	STATUS_CHANGE = 'status_change',
	ITERATION_COMPLETE = 'iteration_complete',
	COMPLETED = 'completed',
	FAILED = 'failed',
	INITIAL_STATE = 'initial_state',
}

export interface GenerationEvent {
	type: GenerationEventType;
	requestId: string;
	data: Record<string, unknown>;
	timestamp: string;
}
