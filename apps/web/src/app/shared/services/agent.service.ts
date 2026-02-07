import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

@Injectable({
	providedIn: 'root',
})
export class AgentService {
	private readonly apiUrl = environment.apiUrl;
	private readonly defaultHeaders = new HttpHeaders({
		Accept: 'application/json',
	});

	constructor(private readonly http: HttpClient) {}

	// List agents with optional search/sort
	getAgents(
		orgId: string,
		query?: string,
		sortBy?: string,
		order?: string,
	): Observable<any> {
		let url = `${this.apiUrl}/organization/${orgId}/image-generation/agents`;
		const params: string[] = [];

		if (query) {
			params.push(`query=${encodeURIComponent(query)}`);
		}
		if (sortBy) {
			params.push(`sortBy=${sortBy}`);
		}
		if (order) {
			params.push(`order=${order}`);
		}

		if (params.length > 0) {
			url += '?' + params.join('&');
		}

		return this.http.get<any>(url, { headers: this.defaultHeaders });
	}

	// Get single agent
	getAgent(orgId: string, agentId: string): Observable<any> {
		return this.http.get<any>(
			`${this.apiUrl}/organization/${orgId}/image-generation/agents/${agentId}`,
			{ headers: this.defaultHeaders },
		);
	}

	// Create agent
	createAgent(orgId: string, dto: any): Observable<any> {
		return this.http.post<any>(
			`${this.apiUrl}/organization/${orgId}/image-generation/agents`,
			dto,
			{ headers: this.defaultHeaders },
		);
	}

	// Update agent
	updateAgent(orgId: string, agentId: string, dto: any): Observable<any> {
		return this.http.put<any>(
			`${this.apiUrl}/organization/${orgId}/image-generation/agents/${agentId}`,
			dto,
			{ headers: this.defaultHeaders },
		);
	}

	// Delete agent
	deleteAgent(orgId: string, agentId: string): Observable<any> {
		return this.http.delete<any>(
			`${this.apiUrl}/organization/${orgId}/image-generation/agents/${agentId}`,
			{ headers: this.defaultHeaders },
		);
	}

	// Get documents for an agent (SEPARATE endpoint, not included in agent response)
	getDocuments(orgId: string, agentId: string): Observable<any> {
		return this.http.get<any>(
			`${this.apiUrl}/organization/${orgId}/image-generation/agents/${agentId}/documents`,
			{ headers: this.defaultHeaders },
		);
	}

	// Upload document (multipart form data)
	uploadDocument(
		orgId: string,
		agentId: string,
		file: File,
	): Observable<any> {
		const formData = new FormData();
		formData.append('file', file);
		// Don't set Content-Type header - let browser set it with boundary for multipart
		return this.http.post<any>(
			`${this.apiUrl}/organization/${orgId}/image-generation/agents/${agentId}/documents`,
			formData,
		);
	}

	// Delete document
	deleteDocument(
		orgId: string,
		agentId: string,
		documentId: string,
	): Observable<any> {
		return this.http.delete<any>(
			`${this.apiUrl}/organization/${orgId}/image-generation/agents/${agentId}/documents/${documentId}`,
			{ headers: this.defaultHeaders },
		);
	}

	// Upload image for compliance evaluation
	uploadComplianceImage(orgId: string, file: File): Observable<any> {
		const formData = new FormData();
		formData.append('file', file);
		return this.http.post<any>(
			`${this.apiUrl}/organization/${orgId}/image-generation/requests/images/upload`,
			formData,
		);
	}

	// Evaluate images with judges
	evaluateImage(
		orgId: string,
		body: {
			brief: string;
			imageUrls: string[];
			judgeIds: string[];
			promptUsed?: string;
		},
	): Observable<any> {
		return this.http.post<any>(
			`${this.apiUrl}/organization/${orgId}/image-generation/evaluate`,
			body,
			{ headers: this.defaultHeaders },
		);
	}
}
