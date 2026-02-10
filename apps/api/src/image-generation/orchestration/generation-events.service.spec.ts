import {
	GenerationEventsService,
	GenerationEventType,
	GenerationEvent,
} from './generation-events.service';

describe('GenerationEventsService', () => {
	let service: GenerationEventsService;

	beforeEach(() => {
		service = new GenerationEventsService();
	});

	// ─── subscribe / emit basics ───────────────────────────────────────────────

	describe('subscribe() and emit()', () => {
		it('should deliver events to a subscriber', async () => {
			const requestId = 'req-1';
			const received: GenerationEvent[] = [];

			// Subscribe first, then emit
			const sub = service.subscribe(requestId).subscribe((event) => {
				received.push(event);
			});

			service.emit(requestId, GenerationEventType.STATUS_CHANGE, {
				status: 'generating',
			});

			expect(received).toHaveLength(1);
			expect(received[0].type).toBe(GenerationEventType.STATUS_CHANGE);
			expect(received[0].requestId).toBe(requestId);
			expect(received[0].data).toEqual({ status: 'generating' });
			expect(received[0].timestamp).toBeInstanceOf(Date);

			sub.unsubscribe();
		});

		it('should not deliver events when no subscribers exist', () => {
			// This should not throw, just silently skip
			expect(() => {
				service.emit(
					'no-subscribers',
					GenerationEventType.STATUS_CHANGE,
					{
						status: 'test',
					},
				);
			}).not.toThrow();
		});

		it('should support multiple subscribers for the same request', async () => {
			const requestId = 'req-multi';
			const received1: GenerationEvent[] = [];
			const received2: GenerationEvent[] = [];

			const sub1 = service.subscribe(requestId).subscribe((event) => {
				received1.push(event);
			});
			const sub2 = service.subscribe(requestId).subscribe((event) => {
				received2.push(event);
			});

			service.emit(requestId, GenerationEventType.ITERATION_COMPLETE, {
				iteration: 1,
			});

			expect(received1).toHaveLength(1);
			expect(received2).toHaveLength(1);

			sub1.unsubscribe();
			sub2.unsubscribe();
		});

		it('should isolate events between different request IDs', () => {
			const received1: GenerationEvent[] = [];
			const received2: GenerationEvent[] = [];

			const sub1 = service.subscribe('req-a').subscribe((event) => {
				received1.push(event);
			});
			const sub2 = service.subscribe('req-b').subscribe((event) => {
				received2.push(event);
			});

			service.emit('req-a', GenerationEventType.STATUS_CHANGE, {
				for: 'a',
			});
			service.emit('req-b', GenerationEventType.STATUS_CHANGE, {
				for: 'b',
			});

			expect(received1).toHaveLength(1);
			expect(received1[0].data).toEqual({ for: 'a' });
			expect(received2).toHaveLength(1);
			expect(received2[0].data).toEqual({ for: 'b' });

			sub1.unsubscribe();
			sub2.unsubscribe();
		});
	});

	// ─── Terminal events ───────────────────────────────────────────────────────

	describe('terminal events (COMPLETED / FAILED)', () => {
		it('should complete the observable on COMPLETED event', async () => {
			const requestId = 'req-complete';
			let completed = false;

			const sub = service.subscribe(requestId).subscribe({
				complete: () => {
					completed = true;
				},
			});

			service.emit(requestId, GenerationEventType.COMPLETED, {
				score: 85,
			});

			expect(completed).toBe(true);
			sub.unsubscribe();
		});

		it('should complete the observable on FAILED event', async () => {
			const requestId = 'req-fail';
			let completed = false;

			const sub = service.subscribe(requestId).subscribe({
				complete: () => {
					completed = true;
				},
			});

			service.emit(requestId, GenerationEventType.FAILED, {
				error: 'timeout',
			});

			expect(completed).toBe(true);
			sub.unsubscribe();
		});

		it('should clean up resources after terminal event', () => {
			const requestId = 'req-cleanup';

			const sub = service.subscribe(requestId).subscribe();

			expect(service.hasSubscribers(requestId)).toBe(true);
			service.emit(requestId, GenerationEventType.COMPLETED, {});
			expect(service.hasSubscribers(requestId)).toBe(false);

			sub.unsubscribe();
		});
	});

	// ─── getSubscriberCount / hasSubscribers ────────────────────────────────

	describe('getSubscriberCount() and hasSubscribers()', () => {
		it('should return 0 for unknown request ID', () => {
			expect(service.getSubscriberCount('nonexistent')).toBe(0);
		});

		it('should return false for hasSubscribers on unknown request', () => {
			expect(service.hasSubscribers('nonexistent')).toBe(false);
		});

		it('should track subscriber count correctly', () => {
			const requestId = 'req-count';
			expect(service.getSubscriberCount(requestId)).toBe(0);

			const sub1 = service.subscribe(requestId).subscribe();
			expect(service.getSubscriberCount(requestId)).toBe(1);

			const sub2 = service.subscribe(requestId).subscribe();
			expect(service.getSubscriberCount(requestId)).toBe(2);

			sub1.unsubscribe();
			expect(service.getSubscriberCount(requestId)).toBe(1);

			sub2.unsubscribe();
			expect(service.getSubscriberCount(requestId)).toBe(0);
		});

		it('should return true for hasSubscribers when at least 1 subscriber exists', () => {
			const requestId = 'req-has';

			const sub = service.subscribe(requestId).subscribe();
			expect(service.hasSubscribers(requestId)).toBe(true);

			sub.unsubscribe();
			expect(service.hasSubscribers(requestId)).toBe(false);
		});
	});

	// ─── Cleanup on last unsubscribe ────────────────────────────────────────

	describe('cleanup on last unsubscribe', () => {
		it('should clean up subject when last subscriber unsubscribes', () => {
			const requestId = 'req-auto-cleanup';

			const sub = service.subscribe(requestId).subscribe();
			expect(service.hasSubscribers(requestId)).toBe(true);

			sub.unsubscribe();
			expect(service.hasSubscribers(requestId)).toBe(false);

			// Emitting after cleanup should not throw
			expect(() =>
				service.emit(requestId, GenerationEventType.STATUS_CHANGE, {}),
			).not.toThrow();
		});
	});

	// ─── Event data integrity ───────────────────────────────────────────────

	describe('event data integrity', () => {
		it('should include timestamp on every event', () => {
			const requestId = 'req-ts';
			const received: GenerationEvent[] = [];

			const sub = service.subscribe(requestId).subscribe((event) => {
				received.push(event);
			});

			service.emit(requestId, GenerationEventType.INITIAL_STATE, {
				hello: 'world',
			});

			expect(received[0].timestamp).toBeInstanceOf(Date);
			expect(received[0].timestamp.getTime()).toBeLessThanOrEqual(
				Date.now(),
			);

			sub.unsubscribe();
		});

		it('should pass through arbitrary data in events', () => {
			const requestId = 'req-data';
			const received: GenerationEvent[] = [];

			const sub = service.subscribe(requestId).subscribe((event) => {
				received.push(event);
			});

			const complexData = {
				iteration: 5,
				score: 72.5,
				nested: { key: 'value' },
				list: [1, 2, 3],
			};

			service.emit(
				requestId,
				GenerationEventType.ITERATION_COMPLETE,
				complexData,
			);

			expect(received[0].data).toEqual(complexData);

			sub.unsubscribe();
		});
	});
});
