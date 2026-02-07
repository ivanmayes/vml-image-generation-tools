import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Project } from '../models/project.model';

interface ApiResponse<T> {
	status: string;
	message?: string;
	data?: T;
}

export interface CreateProjectDto {
	name: string;
	description?: string;
	spaceId?: string;
}

export interface UpdateProjectDto {
	name?: string;
	description?: string;
	settings?: Record<string, unknown>;
}

@Injectable({
	providedIn: 'root',
})
export class ProjectService {
	private readonly apiUrl = environment.apiUrl;
	private readonly defaultHeaders = new HttpHeaders({
		Accept: 'application/json',
	});

	constructor(private readonly http: HttpClient) {}

	private basePath(orgId: string): string {
		return `${this.apiUrl}/organization/${orgId}/image-generation/projects`;
	}

	getProjects(
		orgId: string,
		options?: {
			spaceId?: string;
			limit?: number;
			offset?: number;
		},
	): Observable<ApiResponse<Project[]>> {
		let url = this.basePath(orgId);
		const params: string[] = [];

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

		return this.http.get<ApiResponse<Project[]>>(url, {
			headers: this.defaultHeaders,
		});
	}

	getProject(
		orgId: string,
		projectId: string,
	): Observable<ApiResponse<Project>> {
		return this.http.get<ApiResponse<Project>>(
			`${this.basePath(orgId)}/${projectId}`,
			{ headers: this.defaultHeaders },
		);
	}

	createProject(
		orgId: string,
		dto: CreateProjectDto,
	): Observable<ApiResponse<Project>> {
		return this.http.post<ApiResponse<Project>>(this.basePath(orgId), dto, {
			headers: this.defaultHeaders,
		});
	}

	updateProject(
		orgId: string,
		projectId: string,
		dto: UpdateProjectDto,
	): Observable<ApiResponse<Project>> {
		return this.http.put<ApiResponse<Project>>(
			`${this.basePath(orgId)}/${projectId}`,
			dto,
			{ headers: this.defaultHeaders },
		);
	}

	deleteProject(
		orgId: string,
		projectId: string,
	): Observable<ApiResponse<void>> {
		return this.http.delete<ApiResponse<void>>(
			`${this.basePath(orgId)}/${projectId}`,
			{ headers: this.defaultHeaders },
		);
	}
}
