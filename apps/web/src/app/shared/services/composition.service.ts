import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import {
	Composition,
	CompositionVersion,
	CompositionListResponse,
	VersionListResponse,
	SignedUrlResponse,
	CreateCompositionDto,
	UpdateCompositionDto,
	CreateCompositionVersionDto,
} from '../models/composition.model';

interface ApiResponse<T> {
	status: string;
	message?: string;
	data?: T;
}

@Injectable({
	providedIn: 'root',
})
export class CompositionService {
	private readonly apiUrl = environment.apiUrl;
	private readonly defaultHeaders = new HttpHeaders({
		Accept: 'application/json',
	});

	constructor(private readonly http: HttpClient) {}

	private basePath(orgId: string): string {
		return `${this.apiUrl}/organization/${orgId}/compositions`;
	}

	// ─── Composition CRUD ────────────────────────────────────────────────────

	list(
		orgId: string,
		options?: { projectId?: string; limit?: number; offset?: number },
	): Observable<CompositionListResponse> {
		let url = this.basePath(orgId);
		const params: string[] = [];
		if (options?.projectId) params.push(`projectId=${options.projectId}`);
		if (options?.limit) params.push(`limit=${options.limit}`);
		if (options?.offset) params.push(`offset=${options.offset}`);
		if (params.length > 0) url += '?' + params.join('&');

		return this.http
			.get<ApiResponse<CompositionListResponse>>(url, {
				headers: this.defaultHeaders,
			})
			.pipe(map((r: ApiResponse<CompositionListResponse>) => r.data!));
	}

	getOne(orgId: string, compositionId: string): Observable<Composition> {
		const url = `${this.basePath(orgId)}/${compositionId}`;
		return this.http
			.get<ApiResponse<Composition>>(url, {
				headers: this.defaultHeaders,
			})
			.pipe(map((r: ApiResponse<Composition>) => r.data!));
	}

	create(orgId: string, dto: CreateCompositionDto): Observable<Composition> {
		return this.http
			.post<ApiResponse<Composition>>(this.basePath(orgId), dto, {
				headers: this.defaultHeaders,
			})
			.pipe(map((r: ApiResponse<Composition>) => r.data!));
	}

	update(
		orgId: string,
		compositionId: string,
		dto: UpdateCompositionDto,
	): Observable<Composition> {
		const url = `${this.basePath(orgId)}/${compositionId}`;
		return this.http
			.patch<ApiResponse<Composition>>(url, dto, {
				headers: this.defaultHeaders,
			})
			.pipe(map((r: ApiResponse<Composition>) => r.data!));
	}

	delete(orgId: string, compositionId: string): Observable<void> {
		const url = `${this.basePath(orgId)}/${compositionId}`;
		return this.http
			.delete<ApiResponse<void>>(url, {
				headers: this.defaultHeaders,
			})
			.pipe(map(() => undefined));
	}

	// ─── Version Operations ──────────────────────────────────────────────────

	listVersions(
		orgId: string,
		compositionId: string,
		options?: { limit?: number; offset?: number },
	): Observable<VersionListResponse> {
		let url = `${this.basePath(orgId)}/${compositionId}/versions`;
		const params: string[] = [];
		if (options?.limit) params.push(`limit=${options.limit}`);
		if (options?.offset) params.push(`offset=${options.offset}`);
		if (params.length > 0) url += '?' + params.join('&');

		return this.http
			.get<ApiResponse<VersionListResponse>>(url, {
				headers: this.defaultHeaders,
			})
			.pipe(map((r: ApiResponse<VersionListResponse>) => r.data!));
	}

	getVersion(
		orgId: string,
		compositionId: string,
		versionId: string,
	): Observable<CompositionVersion> {
		const url = `${this.basePath(orgId)}/${compositionId}/versions/${versionId}`;
		return this.http
			.get<ApiResponse<CompositionVersion>>(url, {
				headers: this.defaultHeaders,
			})
			.pipe(map((r: ApiResponse<CompositionVersion>) => r.data!));
	}

	createVersion(
		orgId: string,
		compositionId: string,
		dto: CreateCompositionVersionDto,
	): Observable<CompositionVersion> {
		const url = `${this.basePath(orgId)}/${compositionId}/versions`;
		return this.http
			.post<ApiResponse<CompositionVersion>>(url, dto, {
				headers: this.defaultHeaders,
			})
			.pipe(map((r: ApiResponse<CompositionVersion>) => r.data!));
	}

	// ─── S3 URL Resolution ───────────────────────────────────────────────────

	getSignedUrl(orgId: string, s3Key: string): Observable<string> {
		const url = `${this.basePath(orgId)}/signed-url?key=${encodeURIComponent(s3Key)}`;
		return this.http
			.get<ApiResponse<SignedUrlResponse>>(url, {
				headers: this.defaultHeaders,
			})
			.pipe(map((r: ApiResponse<SignedUrlResponse>) => r.data!.url));
	}

	/**
	 * Fetch a version image as a blob URL (same-origin) to avoid canvas taint.
	 */
	getVersionImageBlob(
		orgId: string,
		compositionId: string,
		versionId: string,
	): Observable<string> {
		const url = `${this.basePath(orgId)}/${compositionId}/versions/${versionId}/image`;
		return this.http
			.get(url, {
				responseType: 'blob',
			})
			.pipe(map((blob: Blob) => URL.createObjectURL(blob)));
	}
}
