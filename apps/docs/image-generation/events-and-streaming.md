# Events & Streaming

The image generation system provides real-time progress updates via Server-Sent Events (SSE). This allows the frontend to display live status changes, iteration results, and completion notifications without polling.

## Architecture

**Source:** `apps/api/src/image-generation/orchestration/generation-events.service.ts`

The `GenerationEventsService` is an in-memory pub/sub system built on RxJS `Subject`:

```
OrchestrationService                GenerationEventsService              Frontend
      │                                     │                              │
      │── emit(requestId, type, data) ──▶  │                              │
      │                                     │── Subject.next(event) ──▶   │
      │                                     │                              │── EventSource
      │                                     │◀── subscribe(requestId) ────│
      │                                     │                              │
```

Each generation request gets its own `Subject<GenerationEvent>`. When the frontend connects via SSE, it subscribes to that subject. When the orchestration service emits events, they flow through the subject to all connected clients.

## Event Types

| Event Type           | When Emitted                                | Data Payload                                                              |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| `INITIAL_STATE`      | When SSE connection is first established    | Full request state + all images (solves race condition)                   |
| `STATUS_CHANGE`      | When the request transitions between phases | `{ status, iteration }`                                                   |
| `ITERATION_COMPLETE` | When an iteration finishes                  | `{ iteration: IterationSnapshot, imageIds, strategy, generationMode }`    |
| `COMPLETED`          | When the request completes                  | `{ status, completionReason, finalScore, finalImageId, totalIterations }` |
| `FAILED`             | When the request fails                      | `{ status, error, bestScore }`                                            |

### Status Transitions

During each iteration, the status progresses through:

```
pending → optimizing → generating → evaluating → (next iteration or completed/failed)
```

The frontend receives a `STATUS_CHANGE` event for each transition, allowing it to show the current phase.

## SSE Endpoint

```
GET /organization/:orgId/image-generation/requests/:id/stream?token={jwt}
```

This is an `@Sse()` endpoint that returns an RxJS Observable mapped to NestJS MessageEvent format.

### Authentication

Because `EventSource` (the browser's SSE client) can't send custom headers, authentication is done via a `token` query parameter:

```typescript
const eventSource = new EventSource(
  `/api/organization/${orgId}/image-generation/requests/${requestId}/stream?token=${jwtToken}`,
);
```

The server validates the JWT and checks organization access before establishing the stream.

### Race Condition Handling

When a client connects to the SSE endpoint, the server immediately emits an `INITIAL_STATE` event containing the full current request state and all generated images. This handles the race condition where:

1. User creates a request
2. Request starts processing
3. User opens the detail page
4. SSE connects — but may have missed early events

The `INITIAL_STATE` event ensures the frontend has the complete picture regardless of when it connects.

## Lifecycle Management

### Subject Creation

Subjects are created lazily — a `Subject` for a request ID is only created when the first subscriber connects.

### Auto-Cleanup

- **Terminal events:** When a `COMPLETED` or `FAILED` event is emitted, the subject is completed and removed from the map.
- **Unsubscribe:** The observable uses RxJS `finalize()` to track subscriber counts. When the last subscriber disconnects, the subject is completed and cleaned up.
- **Client disconnect:** When the browser closes the SSE connection, the HTTP request's `close` event triggers the observable's cleanup path.

### Subscriber Tracking

The service tracks subscriber counts per request:

```typescript
getSubscriberCount(requestId: string): number
hasSubscribers(requestId: string): boolean
```

If a request has no subscribers, emitted events are silently dropped (no subject exists).

## Frontend Integration

The Angular frontend subscribes to events in the `GenerationDetailPage`:

1. **Connect** — Creates an `EventSource` with the JWT token
2. **Handle events** — Processes each event type to update the page state
3. **Reconnect** — If the connection drops, the frontend reconnects and receives `INITIAL_STATE` to resync

### Event Type Handling

- `INITIAL_STATE` — Populates the full page: request details, iteration list, images
- `STATUS_CHANGE` — Updates the status badge and phase indicator
- `ITERATION_COMPLETE` — Adds a new iteration card to the timeline, loads new images
- `COMPLETED` — Shows the completion banner with reason and final score
- `FAILED` — Shows the error message

See [Generation Pages](../web/generation-pages.md) for frontend implementation details.

## Event Format

Events are sent as standard SSE messages:

```
id: {requestId}-{timestamp}
event: iteration_complete
data: {"type":"iteration_complete","requestId":"uuid","data":{...},"timestamp":"2024-..."}
```

The `id` field allows the browser to resume from where it left off if the connection drops (though in practice, `INITIAL_STATE` provides a full resync).
