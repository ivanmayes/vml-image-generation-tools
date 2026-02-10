import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, of } from 'rxjs';
import { catchError, map, tap, finalize } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import {
	SuggestPromptRequest,
	SuggestPromptResponse,
	PromptEnhancementMode,
} from '../models/prompt-enhancement.model';
import { LruCache } from '../utils/lru-cache';

@Injectable({
	providedIn: 'root',
})
export class PromptEnhancementService {
	private readonly apiUrl = environment.apiUrl;
	private readonly cache = new LruCache<string, string>(50);
	private readonly loadingSubject = new BehaviorSubject<boolean>(false);
	readonly isLoading$ = this.loadingSubject.asObservable();

	private readonly defaultHeaders = new HttpHeaders({
		Accept: 'application/json',
		'Content-Type': 'application/json',
	});

	constructor(private readonly http: HttpClient) {}

	get isLoading(): boolean {
		return this.loadingSubject.value;
	}

	enhancePrompt(prompt: string): Observable<string> {
		const cacheKey = `${PromptEnhancementMode.ENHANCE}:${prompt}`;

		const cached = this.cache.get(cacheKey);
		if (cached) {
			return of(cached);
		}

		const request: SuggestPromptRequest = {
			mode: PromptEnhancementMode.ENHANCE,
			prompt,
		};

		this.loadingSubject.next(true);

		const url = `${this.apiUrl}/image-generation/suggest-prompt`;

		return this.http
			.post<SuggestPromptResponse>(url, request, {
				headers: this.defaultHeaders,
			})
			.pipe(
				map((response) => {
					if (!response.enhancedPrompt) {
						throw new Error('No enhanced prompt in response');
					}
					return response.enhancedPrompt;
				}),
				tap((enhancedPrompt) => {
					this.cache.set(cacheKey, enhancedPrompt);
				}),
				catchError((error) => {
					let errorMessage =
						'Failed to enhance prompt. Please try again.';
					if (error.status === 404) {
						errorMessage =
							'Prompt enhancement is not yet available.';
					} else if (error.status === 503) {
						errorMessage =
							'AI service temporarily unavailable. Please try again later.';
					} else if (error.status === 429) {
						errorMessage =
							'Rate limit exceeded. Please wait a moment.';
					}
					return throwError(() => new Error(errorMessage));
				}),
				finalize(() => {
					this.loadingSubject.next(false);
				}),
			);
	}
}
