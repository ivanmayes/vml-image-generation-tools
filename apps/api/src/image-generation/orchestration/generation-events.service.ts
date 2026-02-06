import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

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
	timestamp: Date;
}

export interface SseMessageEvent {
	data: GenerationEvent;
	id?: string;
	type?: string;
	retry?: number;
}

@Injectable()
export class GenerationEventsService {
	private readonly logger = new Logger(GenerationEventsService.name);
	private readonly subjects = new Map<string, Subject<GenerationEvent>>();
	private readonly subscriberCounts = new Map<string, number>();

	/**
	 * Emit an event for a specific request
	 */
	public emit(
		requestId: string,
		type: GenerationEventType,
		data: Record<string, unknown>,
	): void {
		const subject = this.subjects.get(requestId);
		if (!subject) {
			this.logger.debug(
				`No subscribers for request ${requestId}, skipping event ${type}`,
			);
			return;
		}

		const event: GenerationEvent = {
			type,
			requestId,
			data,
			timestamp: new Date(),
		};

		subject.next(event);

		// Auto-complete terminal events
		if (
			type === GenerationEventType.COMPLETED ||
			type === GenerationEventType.FAILED
		) {
			subject.complete();
			this.subjects.delete(requestId);
			this.subscriberCounts.delete(requestId);
		}
	}

	/**
	 * Subscribe to events for a specific request.
	 * Creates the subject on first subscription, auto-cleans on last unsubscribe.
	 */
	public subscribe(requestId: string): Observable<GenerationEvent> {
		if (!this.subjects.has(requestId)) {
			this.subjects.set(requestId, new Subject<GenerationEvent>());
			this.subscriberCounts.set(requestId, 0);
		}

		const count = (this.subscriberCounts.get(requestId) ?? 0) + 1;
		this.subscriberCounts.set(requestId, count);
		this.logger.debug(
			`Subscriber added for request ${requestId} (total: ${count})`,
		);

		return this.subjects
			.get(requestId)!
			.asObservable()
			.pipe(
				finalize(() => {
					const remaining =
						(this.subscriberCounts.get(requestId) ?? 1) - 1;
					this.subscriberCounts.set(requestId, remaining);
					this.logger.debug(
						`Subscriber removed for request ${requestId} (remaining: ${remaining})`,
					);

					if (remaining <= 0) {
						this.subjects.get(requestId)?.complete();
						this.subjects.delete(requestId);
						this.subscriberCounts.delete(requestId);
					}
				}),
			);
	}

	/**
	 * Get current subscriber count for a request
	 */
	public getSubscriberCount(requestId: string): number {
		return this.subscriberCounts.get(requestId) ?? 0;
	}

	/**
	 * Check if a request has any active subscribers
	 */
	public hasSubscribers(requestId: string): boolean {
		return this.getSubscriberCount(requestId) > 0;
	}
}
