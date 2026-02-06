/**
 * Agent-related types for the web application.
 *
 * DTOs are imported from the API to ensure consistency.
 * Interfaces match the backend entity toPublic() responses.
 * Documents come from a separate API call (GET /agents/:id/documents).
 */

// Import DTOs from API - these are the source of truth for request payloads
export type { AgentCreateDto } from '@api/image-generation/agent/dtos';
export type { AgentUpdateDto } from '@api/image-generation/agent/dtos';
export type { RagConfigDto } from '@api/image-generation/agent/dtos';

// RagConfig interface
export interface RagConfig {
	topK: number;
	similarityThreshold: number;
}

// Agent interface matching API toPublic() response
export interface Agent {
	id: string;
	organizationId: string;
	name: string;
	systemPrompt: string;
	evaluationCategories?: string;
	optimizationWeight: number;
	scoringWeight: number;
	ragConfig: RagConfig;
	templateId?: string;
	createdAt: string;
}

// AgentDocument interface matching API toPublic() response
export interface AgentDocument {
	id: string;
	agentId: string;
	filename: string;
	mimeType: string;
	version: number;
	chunkCount: number;
	metadata?: {
		fileSize?: number;
		pageCount?: number;
		processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
		processingError?: string;
	};
	createdAt: string;
}

// Evaluation result interfaces (for test tab)
export interface TopIssue {
	problem: string;
	severity: 'critical' | 'major' | 'moderate' | 'minor';
	fix: string;
}

export interface EvaluationResult {
	agentId: string;
	agentName: string;
	score: number;
	categoryScores?: Record<string, number>;
	feedback: string;
	topIssue?: TopIssue;
	whatWorked?: string[];
	checklist?: Record<string, { passed: boolean; note?: string }>;
}

export interface EvaluationResponse {
	winner: {
		imageUrl: string;
		aggregateScore: number;
		evaluations: EvaluationResult[];
	};
	ranking: {
		imageUrl: string;
		aggregateScore: number;
		evaluations: EvaluationResult[];
	}[];
	judges: { id: string; name: string; weight: number }[];
	brief: string;
	imageCount: number;
	judgeCount: number;
}
