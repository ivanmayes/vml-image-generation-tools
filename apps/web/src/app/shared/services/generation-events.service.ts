import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { fetchEventSource } from '@microsoft/fetch-event-source';

import { environment } from '../../../environments/environment';
import {
	GenerationEvent,
	GenerationEventType,
} from '../models/generation-request.model';

/**
 * Service for subscribing to real-time generation events via SSE.
 *
 * Uses @microsoft/fetch-event-source instead of native EventSource
 * because EventSource cannot send Authorization headers.
 */
@Injectable({
	providedIn: 'root',
})
export class GenerationEventsService implements OnDestroy {
	private readonly apiUrl = environment.apiUrl;
	private abortControllers = new Map<string, AbortController>();

	ngOnDestroy(): void {
		// Abort all active connections on service destroy
		this.abortControllers.forEach((ctrl) => ctrl.abort());
		this.abortControllers.clear();
	}

	/**
	 * Subscribe to SSE events for a generation request.
	 * Returns an Observable that emits GenerationEvent objects.
	 * Automatically reconnects on non-fatal errors.
	 */
	connect(
		orgId: string,
		requestId: string,
		token: string,
	): Observable<GenerationEvent> {
		const subject = new Subject<GenerationEvent>();

		// Abort any existing connection for this request
		this.disconnect(requestId);

		const ctrl = new AbortController();
		this.abortControllers.set(requestId, ctrl);

		const url = `${this.apiUrl}/organization/${orgId}/image-generation/requests/${requestId}/stream?token=${encodeURIComponent(token)}`;

		fetchEventSource(url, {
			signal: ctrl.signal,
			openWhenHidden: true, // Keep connection alive when tab is hidden

			onopen: async (response: Response) => {
				if (!response.ok) {
					throw new Error(
						`SSE connection failed: ${response.status}`,
					);
				}
			},

			onmessage: (event: { data: string }) => {
				try {
					const data = JSON.parse(event.data) as GenerationEvent;
					subject.next(data);

					// Auto-complete on terminal events
					if (
						data.type === GenerationEventType.COMPLETED ||
						data.type === GenerationEventType.FAILED
					) {
						subject.complete();
						this.cleanup(requestId);
					}
				} catch {
					// Skip malformed events
				}
			},

			onerror: (err: unknown) => {
				if (ctrl.signal.aborted) {
					// Intentional disconnect — don't emit error
					return;
				}
				subject.error(err);
				this.cleanup(requestId);
			},

			onclose: () => {
				subject.complete();
				this.cleanup(requestId);
			},
		}).catch((err: unknown) => {
			if (!ctrl.signal.aborted) {
				subject.error(err);
				this.cleanup(requestId);
			}
		});

		return subject.asObservable();
	}

	/**
	 * Disconnect from SSE for a specific request
	 */
	disconnect(requestId: string): void {
		const ctrl = this.abortControllers.get(requestId);
		if (ctrl) {
			ctrl.abort();
			this.cleanup(requestId);
		}
	}

	/**
	 * Check if there's an active connection for a request
	 */
	isConnected(requestId: string): boolean {
		const ctrl = this.abortControllers.get(requestId);
		return !!ctrl && !ctrl.signal.aborted;
	}

	private cleanup(requestId: string): void {
		this.abortControllers.delete(requestId);
	}
}
