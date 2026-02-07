# Orchestration Pipeline

The `OrchestrationService` is the heart of the system. It manages the full lifecycle of a generation request from start to completion, coordinating between image generation, evaluation, prompt optimization, S3 storage, event streaming, cost tracking, and debug output.

**Source:** `apps/api/src/image-generation/orchestration/orchestration.service.ts`

## How a Request Executes

When a generation request is created, the `JobQueueService` triggers `OrchestrationService.executeRequest(requestId)`. Here's what happens step by step:

### 1. Load and Validate

The service loads the request from the database and fetches all referenced judge agents. If any agent is missing, the request fails immediately. Agent documents are also loaded for RAG context.

```
Request loaded → Agents loaded (with documents) → Debug session initialized
```

### 2. Enter the Iteration Loop

The service runs a `for` loop from iteration 1 to `maxIterations`. At the top of each iteration, it checks:

- **Cancellation** — Has the user cancelled the request? (via `jobQueueService.isCancelled()`)
- **Timeout** — Has the total orchestration exceeded 10 minutes?

### 3. Select Strategy

For each iteration, the service calls `selectIterationStrategy()` to decide whether to **regenerate** (create new images from scratch) or **edit** (refine the previous best image). The strategy depends on:

- The configured `generationMode` (regeneration/edit/mixed)
- Current score level
- TOP_ISSUE severity from the last evaluation
- Number of consecutive edits (to prevent quality degradation)

See [Generation Modes](generation-modes.md) for the full strategy logic.

### 4a. Regeneration Path

This is the default path:

1. **Optimize Prompt** — The `PromptOptimizerService` generates a new prompt using the original brief, previous judge feedback, RAG context, negative prompts, and reference image awareness.
2. **Generate Images** — The `GeminiImageService.generateImages()` creates N images in parallel from the optimized prompt.

### 4b. Edit Path

When the strategy selects "edit":

1. **Download Source Image** — The best image from the previous iteration is downloaded from S3 as base64.
2. **Build Edit Instruction** — The `PromptOptimizerService.buildEditInstruction()` creates a focused 1–3 sentence edit instruction from the TOP_ISSUE feedback.
3. **Edit Images** — The `GeminiImageService.editImages()` edits the source image N times in parallel.
4. **Fallback** — If editing fails (Gemini sometimes rejects edits), the system automatically falls back to regeneration.

### 5. Upload to S3

All generated images are uploaded to S3 in parallel using `Promise.allSettled()`. The S3 path structure is:

```
image-generation/{orgId}/{requestId}/{imageId}.jpg
```

Each image gets a database record (`GeneratedImage` entity) with the S3 URL, prompt used, and metadata.

### 6. Evaluate

Each image is evaluated by all judge agents in parallel. The evaluation pipeline:

1. Searches each agent's RAG documents for relevant context
2. Builds an evaluation prompt with the brief, image, iteration context, and RAG guidelines
3. Sends the prompt + image to `gemini-2.0-flash` for evaluation
4. Parses the structured JSON response (score, TOP_ISSUE, categoryScores, whatWorked, feedback, promptInstructions)
5. Returns weighted results

See [Agents & Evaluation](agents-and-evaluation.md) for details.

### 7. Aggregate and Rank

The `EvaluationService.aggregateEvaluations()` computes a weighted average score for each image across all judges. Images are ranked by aggregate score, and the top image becomes the iteration winner.

**Weighted scoring formula:**

```
aggregateScore = Σ(judge_score × judge_weight) / Σ(judge_weight)
```

### 8. Save Iteration Snapshot

The iteration results are saved as a JSONB `IterationSnapshot` on the `GenerationRequest` entity. This includes the optimized prompt, selected image ID, aggregate score, and all evaluation details.

### 9. Extract Negative Prompts

The system extracts problems from TOP_ISSUE feedback and accumulates them as "negative prompts" — a growing list of things to avoid in future iterations. This list is:

- Sorted by severity (critical first)
- Deduplicated against existing entries
- Capped at 10 entries maximum to prevent unbounded growth
- Formatted as: `AVOID: [problem] - [fix] (from [agent])`

### 10. Check Termination

The system checks:

1. **Score ≥ threshold?** → Complete with `CompletionReason.SUCCESS`
2. **Score plateauing?** → Complete with `CompletionReason.DIMINISHING_RETURNS`
3. **More iterations available?** → Continue to next iteration
4. **Max iterations reached?** → Complete with `CompletionReason.MAX_RETRIES_REACHED`

### 11. SSE Events

Throughout the process, the service emits Server-Sent Events so the frontend can display real-time progress:

- `STATUS_CHANGE` — When the status transitions (optimizing → generating → evaluating)
- `ITERATION_COMPLETE` — When an iteration finishes, with scores and image IDs
- `COMPLETED` — When the request completes successfully
- `FAILED` — When the request fails with an error

## Retry Logic

The service uses `withRetry()` for all external calls (Gemini API, S3 uploads). Retries use exponential backoff:

- **Max retries:** 3
- **Base delay:** 1000ms
- **Backoff:** 1s → 2s → 4s

Total retries across all iterations are tracked and reported in the orchestration summary.

## Cost Tracking

Each generation request accumulates costs via `requestService.updateCosts()`:

| Cost Type            | When Incremented                            |
| -------------------- | ------------------------------------------- |
| `imageGenerations`   | After each image batch generation           |
| `llmTokens`          | After each evaluation and optimization call |
| `embeddingTokens`    | After RAG chunk searches                    |
| `totalEstimatedCost` | Calculated from token/image counts          |

## Error Handling

If any step throws an unrecoverable error, the orchestration catches it, marks the request as failed, emits a FAILED event, and saves a debug summary. The error message is stored on the request entity for debugging.

## Debug Output

When running locally, the `DebugOutputService` saves:

- Full iteration data (prompts, scores, feedback)
- Generated images to disk
- Final result summary with timing

See [Debug & Testing](debug-and-testing.md).
