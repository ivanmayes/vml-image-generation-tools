import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type {
	Agent,
	AgentDocument,
	EvaluationResponse,
	AgentCreateDto,
	AgentUpdateDto,
} from '../models/agent.model';
import type {
	JudgeAnalyticsResponse,
	QualitativeAnalysisResponse,
	PromptOptimizationResponse,
} from '../models/judge-analytics.model';

interface ApiResponse<T> {
	status: string;
	message?: string;
	data?: T;
}

interface UploadResponse {
	url: string;
}

@Injectable({
	providedIn: 'root',
})
export class AgentService {
	private readonly apiUrl = environment.apiUrl;
	private readonly defaultHeaders = new HttpHeaders({
		Accept: 'application/json',
	});

	constructor(private readonly http: HttpClient) {}

	getAgents(
		orgId: string,
		query?: string,
		sortBy?: string,
		order?: string,
	): Observable<ApiResponse<Agent[]>> {
		let params = new HttpParams();
		if (query) params = params.set('query', query);
		if (sortBy) params = params.set('sortBy', sortBy);
		if (order) params = params.set('order', order);

		return this.http.get<ApiResponse<Agent[]>>(
			`${this.apiUrl}/organization/${orgId}/agents`,
			{ headers: this.defaultHeaders, params },
		);
	}

	getAgent(orgId: string, agentId: string): Observable<ApiResponse<Agent>> {
		return this.http.get<ApiResponse<Agent>>(
			`${this.apiUrl}/organization/${orgId}/agents/${agentId}`,
			{ headers: this.defaultHeaders },
		);
	}

	createAgent(
		orgId: string,
		dto: AgentCreateDto,
	): Observable<ApiResponse<Agent>> {
		return this.http.post<ApiResponse<Agent>>(
			`${this.apiUrl}/organization/${orgId}/agents`,
			dto,
			{ headers: this.defaultHeaders },
		);
	}

	updateAgent(
		orgId: string,
		agentId: string,
		dto: AgentUpdateDto,
	): Observable<ApiResponse<Agent>> {
		return this.http.put<ApiResponse<Agent>>(
			`${this.apiUrl}/organization/${orgId}/agents/${agentId}`,
			dto,
			{ headers: this.defaultHeaders },
		);
	}

	deleteAgent(orgId: string, agentId: string): Observable<ApiResponse<void>> {
		return this.http.delete<ApiResponse<void>>(
			`${this.apiUrl}/organization/${orgId}/agents/${agentId}`,
			{ headers: this.defaultHeaders },
		);
	}

	getDocuments(
		orgId: string,
		agentId: string,
	): Observable<ApiResponse<AgentDocument[]>> {
		return this.http.get<ApiResponse<AgentDocument[]>>(
			`${this.apiUrl}/organization/${orgId}/agents/${agentId}/documents`,
			{ headers: this.defaultHeaders },
		);
	}

	uploadDocument(
		orgId: string,
		agentId: string,
		file: File,
	): Observable<ApiResponse<AgentDocument>> {
		const formData = new FormData();
		formData.append('file', file);
		return this.http.post<ApiResponse<AgentDocument>>(
			`${this.apiUrl}/organization/${orgId}/agents/${agentId}/documents`,
			formData,
		);
	}

	deleteDocument(
		orgId: string,
		agentId: string,
		documentId: string,
	): Observable<ApiResponse<void>> {
		return this.http.delete<ApiResponse<void>>(
			`${this.apiUrl}/organization/${orgId}/agents/${agentId}/documents/${documentId}`,
			{ headers: this.defaultHeaders },
		);
	}

	uploadComplianceImage(
		orgId: string,
		file: File,
	): Observable<ApiResponse<UploadResponse>> {
		const formData = new FormData();
		formData.append('file', file);
		return this.http.post<ApiResponse<UploadResponse>>(
			`${this.apiUrl}/organization/${orgId}/image-generation/requests/images/upload`,
			formData,
		);
	}

	evaluateImage(
		orgId: string,
		body: {
			brief: string;
			imageUrls: string[];
			judgeIds: string[];
			promptUsed?: string;
		},
	): Observable<ApiResponse<EvaluationResponse>> {
		return this.http.post<ApiResponse<EvaluationResponse>>(
			`${this.apiUrl}/organization/${orgId}/image-generation/evaluate`,
			body,
			{ headers: this.defaultHeaders },
		);
	}

	// --- Judge Analytics ---

	getJudgeAnalytics(
		orgId: string,
		agentId: string,
		limit = 50,
	): Observable<ApiResponse<JudgeAnalyticsResponse>> {
		const params = new HttpParams().set('limit', limit.toString());
		return this.http.get<ApiResponse<JudgeAnalyticsResponse>>(
			`${this.apiUrl}/organization/${orgId}/agents/${agentId}/analytics`,
			{ headers: this.defaultHeaders, params },
		);
	}

	analyzeJudge(
		orgId: string,
		agentId: string,
		limit = 50,
	): Observable<ApiResponse<QualitativeAnalysisResponse>> {
		return this.http.post<ApiResponse<QualitativeAnalysisResponse>>(
			`${this.apiUrl}/organization/${orgId}/agents/${agentId}/analytics/analyze`,
			{ limit },
			{ headers: this.defaultHeaders },
		);
	}

	optimizeJudgePrompt(
		orgId: string,
		agentId: string,
		limit = 50,
	): Observable<ApiResponse<PromptOptimizationResponse>> {
		return this.http.post<ApiResponse<PromptOptimizationResponse>>(
			`${this.apiUrl}/organization/${orgId}/agents/${agentId}/analytics/optimize-prompt`,
			{ limit },
			{ headers: this.defaultHeaders },
		);
	}
}
