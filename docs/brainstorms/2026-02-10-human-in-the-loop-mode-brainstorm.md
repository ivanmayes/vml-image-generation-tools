---
date: 2026-02-10
topic: human-in-the-loop-mode
---

# Human-in-the-Loop (HITL) Mode for Iterative Image Generation

## What We're Building

A new execution mode for image generation requests where the system pauses after each iteration, presenting the user with results and defaults, and letting them optionally override decisions before continuing. This sits alongside the existing automatic mode — users choose which mode at request creation time.

The system uses an **Exit-and-Resume** pattern: the backend completes one cycle, saves state, emits an `AWAITING_INPUT` event, and exits. No process is held open while waiting. The user can return at any time — there is no timeout.

## Why This Approach

Three approaches were considered:

1. **Exit-and-Resume** (chosen) — Backend exits between iterations, resumes on user action. Scales cleanly, no held resources, fits existing `continue` endpoint pattern.
2. **Backend Holds with Promise** — Loop blocks on a promise. Simple but doesn't survive deploys, wastes resources, doesn't scale.
3. **Frontend-Driven Loop** — Backend becomes stateless per call. Clean but rewrites the entire orchestration architecture and breaks automatic mode.

Exit-and-Resume was chosen because it requires minimal architectural change, reuses existing patterns, and is production-grade.

## Key Decisions

### Mode Selection

- **Two modes at creation time:** `automatic` (current behavior) and `human_in_the_loop`
- New field on `GenerationRequest` entity: `executionMode` (enum: `AUTOMATIC | HUMAN_IN_THE_LOOP`)
- Automatic mode runs the existing tight loop unchanged

### Pause Points (HITL Mode)

**Pause Point 1: Pre-Generation (after prompt optimization)**

- System runs prompt optimization (brief → enhanced prompt)
- Pauses with status `AWAITING_INPUT`
- Presents: optimized prompt for review/editing
- User can: edit the prompt, change mode/resolution, or just continue

**Pause Point 2: Post-Iteration (after evaluation)**

- System generates images, evaluates them, selects best
- Pauses with status `AWAITING_INPUT`
- Presents: all generated images with scores, judge-selected best image, current prompt, current mode/resolution
- User can:
  - Select a different image as "best" (override judge's pick)
  - Edit the prompt for the next iteration
  - Switch generation mode (regeneration / edit / mixed)
  - Change resolution / aspect ratio
  - Mark as **Complete** (stop early, satisfied with result)
  - Or just click **Continue** (accept all defaults)

### State Machine Addition

```
Existing states:
  PENDING → OPTIMIZING → GENERATING → EVALUATING → COMPLETED|FAILED|CANCELLED

New state for HITL:
  PENDING → OPTIMIZING → AWAITING_INPUT (pre-gen) → GENERATING → EVALUATING → AWAITING_INPUT (post-iter) → loop...

AWAITING_INPUT is a new status enum value.
```

### SSE Event Addition

New event type: `AWAITING_INPUT`

```typescript
{
  type: 'awaiting_input',
  requestId: string,
  data: {
    pausePoint: 'pre_generation' | 'post_iteration',
    iteration: number,
    // Pre-generation pause:
    optimizedPrompt?: string,
    // Post-iteration pause:
    images?: { id: string, score: number, isSelected: boolean }[],
    selectedImageId?: string,
    aggregateScore?: number,
    evaluations?: AgentEvaluationSnapshot[],
    // Always present:
    currentPrompt: string,
    generationMode: 'regeneration' | 'edit' | 'mixed',
    imageParams: { aspectRatio, quality, imagesPerGeneration },
    iterationsRemaining: number
  }
}
```

### Continue/Resume API

Expand the existing `continue` endpoint (or add a new `resume` action) to accept HITL overrides:

```typescript
// POST /organization/:orgId/image-generation/requests/:id/resume
{
  selectedImageId?: string,       // Override best image pick
  promptOverride?: string,        // Override/edit prompt for next iteration
  generationMode?: string,        // Switch mode
  aspectRatio?: string,           // Change resolution
  quality?: string,               // Change quality
  complete?: boolean              // Stop early, mark as completed
}
```

All fields optional — omitting means "accept the default."

### Backend Orchestration Changes

In HITL mode, the orchestration loop becomes:

```
function executeRequest(requestId):
  for each iteration:
    // Phase 1: Prompt optimization
    optimizedPrompt = optimizePrompt(...)

    if HITL mode:
      save state (optimizedPrompt, iteration context)
      set status = AWAITING_INPUT
      emit AWAITING_INPUT event (pausePoint: 'pre_generation')
      RETURN (exit function)

    // Phase 2: Generate images
    images = generateImages(optimizedPrompt)

    // Phase 3: Evaluate
    scores = evaluate(images)
    selectBest(scores)

    if HITL mode:
      save iteration snapshot
      set status = AWAITING_INPUT
      emit AWAITING_INPUT event (pausePoint: 'post_iteration')
      RETURN (exit function)

    // Phase 4: Check termination (automatic mode only reaches here)
    if score >= threshold: complete
    if plateau: handle
```

When the user calls `resume`:

1. Load saved state
2. Apply any overrides
3. Re-enter the orchestration at the correct phase
4. Run the next cycle

### Entity Changes

New fields on `GenerationRequest`:

- `executionMode`: enum `AUTOMATIC | HUMAN_IN_THE_LOOP`
- `awaitingInputPausePoint`: nullable enum `PRE_GENERATION | POST_ITERATION` (tracks which pause point we're at)
- `pendingPrompt`: nullable string (stores the optimized prompt awaiting user review at pre-generation pause)

### Frontend UX

When `AWAITING_INPUT` event arrives:

- Show a review/override panel (replaces the "Generating next iteration..." spinner)
- Pre-populate all fields with defaults
- "Continue" button (primary action — accept defaults)
- "Complete" button (secondary — stop early)
- Editable fields for prompt, mode, resolution
- Image gallery with selectable images (post-iteration pause)

## Open Questions

- Should the mode selection UI be a toggle, radio buttons, or a dropdown on the creation form?
- Should we show a "time paused" indicator?
- When resuming from post-iteration pause with a different selected image, should the edit mode use that image as the base? (Likely yes)

## Next Steps

-> `/workflows:plan` for implementation details
