import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
	RequestCreateDto,
	RequestContinueDto,
} from '@api/image-generation/generation-request/dtos';

import { environment } from '../../../environments/environment';
import {
	GenerationRequestPublic,
	GenerationRequestDetailed,
	GenerationRequestStatus,
	GeneratedImage,
} from '../models/generation-request.model';

interface ApiResponse<T> {
	status: string;
	message?: string;
	data?: T;
}

@Injectable({
	providedIn: 'root',
})
export class GenerationRequestService {
	private readonly apiUrl = environment.apiUrl;
	private readonly defaultHeaders = new HttpHeaders({
		Accept: 'application/json',
	});

	constructor(private readonly http: HttpClient) {}

	private basePath(orgId: string): string {
		return `${this.apiUrl}/organization/${orgId}/image-generation/requests`;
	}

	/**
	 * List generation requests with optional filters
	 */
	getRequests(
		orgId: string,
		options?: {
			status?: GenerationRequestStatus;
			projectId?: string;
			spaceId?: string;
			limit?: number;
			offset?: number;
		},
	): Observable<ApiResponse<GenerationRequestPublic[]>> {
		let url = this.basePath(orgId);
		const params: string[] = [];

		if (options?.status) {
			params.push(`status=${options.status}`);
		}
		if (options?.projectId) {
			params.push(`projectId=${options.projectId}`);
		}
		if (options?.spaceId) {
			params.push(`spaceId=${options.spaceId}`);
		}
		if (options?.limit) {
			params.push(`limit=${options.limit}`);
		}
		if (options?.offset) {
			params.push(`offset=${options.offset}`);
		}

		if (params.length > 0) {
			url += '?' + params.join('&');
		}

		return this.http.get<ApiResponse<GenerationRequestPublic[]>>(url, {
			headers: this.defaultHeaders,
		});
	}

	/**
	 * Get a single generation request with full detail (iterations, evaluations)
	 */
	getRequest(
		orgId: string,
		requestId: string,
	): Observable<ApiResponse<GenerationRequestDetailed>> {
		return this.http.get<ApiResponse<GenerationRequestDetailed>>(
			`${this.basePath(orgId)}/${requestId}`,
			{ headers: this.defaultHeaders },
		);
	}

	/**
	 * Create a new generation request and queue it for processing
	 */
	createRequest(
		orgId: string,
		dto: RequestCreateDto,
	): Observable<ApiResponse<GenerationRequestPublic>> {
		return this.http.post<ApiResponse<GenerationRequestPublic>>(
			this.basePath(orgId),
			dto,
			{ headers: this.defaultHeaders },
		);
	}

	/**
	 * Continue a completed or failed generation request
	 */
	continueRequest(
		orgId: string,
		requestId: string,
		dto: RequestContinueDto,
	): Observable<ApiResponse<GenerationRequestPublic>> {
		return this.http.post<ApiResponse<GenerationRequestPublic>>(
			`${this.basePath(orgId)}/${requestId}/continue`,
			dto,
			{ headers: this.defaultHeaders },
		);
	}

	/**
	 * Cancel a pending or in-progress generation request
	 */
	cancelRequest(
		orgId: string,
		requestId: string,
	): Observable<ApiResponse<void>> {
		return this.http.delete<ApiResponse<void>>(
			`${this.basePath(orgId)}/${requestId}`,
			{ headers: this.defaultHeaders },
		);
	}

	/**
	 * Trigger a pending generation request for processing
	 */
	triggerRequest(
		orgId: string,
		requestId: string,
	): Observable<ApiResponse<GenerationRequestPublic>> {
		return this.http.post<ApiResponse<GenerationRequestPublic>>(
			`${this.basePath(orgId)}/${requestId}/trigger`,
			{},
			{ headers: this.defaultHeaders },
		);
	}

	/**
	 * Get all generated images for a request
	 */
	getImages(
		orgId: string,
		requestId: string,
	): Observable<ApiResponse<GeneratedImage[]>> {
		return this.http.get<ApiResponse<GeneratedImage[]>>(
			`${this.basePath(orgId)}/${requestId}/images`,
			{ headers: this.defaultHeaders },
		);
	}

	/**
	 * Get all generated images across the organization (for image picker)
	 */
	getOrganizationImages(
		orgId: string,
		limit = 50,
		offset = 0,
	): Observable<ApiResponse<GeneratedImage[]>> {
		return this.http.get<ApiResponse<GeneratedImage[]>>(
			`${this.basePath(orgId)}/images?limit=${limit}&offset=${offset}`,
			{ headers: this.defaultHeaders },
		);
	}
}
