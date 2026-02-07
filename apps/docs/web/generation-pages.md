# Generation Workflow Pages

The generation workflow is the primary user-facing feature of the web application. It provides a full interface for creating image generation requests, monitoring progress in real-time, and reviewing results.

## Page Structure

The generation pages live under `apps/web/src/app/pages/generation/` and are accessible at the `/iterative-image-generation` route:

```
generation/
├── generation-list/       # List all generation requests
├── generation-new/        # Create new request form
├── generation-detail/     # Real-time progress and results
└── components/
    ├── round-card/                # Single iteration card
    ├── completion-banner/         # Completion summary
    ├── continuation-editor/       # Resume/continue form
    └── judge-feedback/            # Judge evaluation display
```

## Generation List Page

**Route:** `/iterative-image-generation`

Displays a filterable, paginated list of all generation requests for the current organization.

**Features:**

- Filter by status (pending, optimizing, generating, evaluating, completed, failed, cancelled)
- Filter by project and space
- Pagination with configurable limit and offset
- Shows final image thumbnail, best score, status badge, and creation date for each request
- Status badges use color coding: green for completed, yellow for in-progress states, red for failed

## Generation New Page

**Route:** `/iterative-image-generation/new`

**Source:** `apps/web/src/app/pages/generation/generation-new/`

The creation form for new generation requests. Fields include:

| Field                 | Required | Description                                                 |
| --------------------- | -------- | ----------------------------------------------------------- |
| Brief                 | Yes      | Plain-language description of the desired image             |
| Judges                | Yes      | Multi-select of judge agents from the organization          |
| Project               | No       | Assign to a project for grouping                            |
| Space                 | No       | Assign to a space for access control                        |
| Initial Prompt        | No       | Custom prompt to use instead of the first optimization pass |
| Reference Images      | No       | URLs of reference images for style matching                 |
| Generation Mode       | No       | regeneration / edit / mixed (default: regeneration)         |
| Threshold             | No       | Target score 0–100 (default: 75)                            |
| Max Iterations        | No       | Maximum iteration count (default: 10)                       |
| Images Per Generation | No       | How many images per iteration (default: 3)                  |
| Aspect Ratio          | No       | Image aspect ratio (16:9, 1:1, 4:3)                         |

On submission, the form sends a `POST` to the generation requests API and navigates to the detail page.

## Generation Detail Page

**Route:** `/iterative-image-generation/:id`

**Source:** `apps/web/src/app/pages/generation/generation-detail/`

The most complex page in the application. It shows the full state and progress of a generation request with real-time updates via SSE.

### State Management

The page uses Angular signals for reactive state:

- `request` — The full generation request with iterations
- `loading` — Whether the initial data is loading
- `images` — Map of image ID to image data
- `events` — Array of received SSE events
- `sseConnected` — Whether the SSE connection is active

### SSE Integration

When the page loads:

1. Fetches the current request state via REST API
2. Opens an SSE connection to `/requests/:id/stream?token={jwt}`
3. Processes incoming events to update the UI in real-time

Event handling:

- `INITIAL_STATE` — Populates the full page state (handles the race condition)
- `STATUS_CHANGE` — Updates the status badge and phase indicator
- `ITERATION_COMPLETE` — Adds a new round card to the iteration timeline
- `COMPLETED` — Shows the completion banner
- `FAILED` — Shows the error message

### Iteration Timeline

Each completed iteration is displayed as a **RoundCardComponent** in a vertical timeline. The timeline grows as iterations complete, showing the progression of scores and strategies.

### Completion Banner

When the request completes, the **CompletionBannerComponent** shows:

- Completion reason (threshold met, diminishing returns, max iterations)
- Final score and iteration count
- The selected best image
- Generation mode used
- Total cost breakdown

### Continuation

The **ContinuationEditorComponent** allows resuming a completed or failed request:

- Add more iterations
- Change the generation mode
- Override the prompt
- Swap judges

This sends a `POST /requests/:id/continue` to the API.

## Round Card Component

**Source:** `apps/web/src/app/pages/generation/components/round-card/`

Displays a single iteration's results:

- **Header:** Iteration number, aggregate score (color-coded), strategy used (regenerate/edit)
- **Images:** Grid of generated images for this iteration, with the selected best highlighted
- **Evaluations:** Expandable section showing each judge's score, feedback, and TOP_ISSUE
- **Prompt:** Expandable section showing the optimized prompt used

Score color coding follows severity thresholds:

- 80–100: Green (good)
- 60–79: Yellow/orange (needs improvement)
- 0–59: Red (poor)

## Data Flow

```
GenerationDetailPage
    │
    ├── REST API: GET /requests/:id → initial data
    │
    ├── SSE: /requests/:id/stream → real-time updates
    │
    ├── RoundCardComponent × N (one per iteration)
    │   └── displays scores, images, feedback
    │
    ├── CompletionBannerComponent (if completed)
    │   └── shows final results
    │
    └── ContinuationEditorComponent (if completed/failed)
        └── form to resume generation
```

## Services Used

- **GenerationRequestService** — REST API client for CRUD operations
- **AgentService** — Fetches available judges for the creation form
- **ProjectService** — Fetches available projects for the creation form
- **SessionQuery** — Gets the current user's JWT token for SSE authentication
