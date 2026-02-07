# Debug & Testing

The image generation system includes several development tools for testing and debugging the pipeline without needing the full production setup.

## Debug Controller

**Source:** `apps/api/src/image-generation/debug.controller.ts`

The debug controller provides test endpoints that bypass authentication. These endpoints are only available when `NODE_ENV !== 'production'`.

### Test Request

```
POST /debug/image-generation/test-request
```

Creates a generation request with pre-configured test agents and runs the full pipeline. This is the fastest way to test the orchestration flow end-to-end.

The test request uses:

- A hardcoded VML organization ID
- Pre-built test judge agents with evaluation prompts
- Default parameters (threshold: 75, maxIterations: 10)

### Evaluation Modes

The debug controller supports a `mode` query parameter for testing different evaluation strategies:

| Mode         | Description                                                           |
| ------------ | --------------------------------------------------------------------- |
| `strict`     | Original harsh evaluation prompts — scores tend to be lower           |
| `structured` | Checklists + TOP_ISSUE + scoring calibration — the production default |
| `calibrated` | Reference specs + scoring anchors — experimental scoring approach     |

Usage:

```
POST /debug/image-generation/test-request?mode=structured
```

### Judge Prompt Inspection

The debug controller includes a `getJudgePrompts()` method that returns the full evaluation prompts for each mode. This is useful for debugging scoring inconsistencies — you can see exactly what the judges are being asked.

## Mock Mode

For testing the orchestration pipeline without calling the real Gemini API:

```bash
IMAGE_GEN_MOCK=true
```

In mock mode:

- Image generation returns a 1x1 pixel red PNG
- API calls are replaced with a 100ms delay
- All orchestration logic runs normally (optimization, evaluation, scoring)
- Useful for testing the iteration loop, SSE events, and UI integration

## Debug Output Service

**Source:** `apps/api/src/image-generation/orchestration/debug-output.service.ts`

The `DebugOutputService` saves detailed telemetry during orchestration runs. When enabled, it writes to the `debug-output/` directory (which is gitignored):

```
debug-output/
└── {requestId}/
    ├── session.json          # Request metadata, agent config
    ├── iteration-1/
    │   ├── data.json         # Prompt, scores, feedback
    │   ├── image-{id}.jpg    # Generated images
    │   └── ...
    ├── iteration-2/
    │   └── ...
    └── final-result.json     # Completion reason, timing, best score
```

### What Gets Saved

Per session:

- Request ID, organization ID, brief
- Threshold and max iterations
- Agent names and weights

Per iteration:

- Optimized prompt text
- Generated image files (saved to disk)
- Evaluation results per agent (scores, feedback, TOP_ISSUE)
- Aggregate score and selected image ID
- Timestamp

Final result:

- Completion status and reason
- Best score and best image ID
- Total elapsed time

## Testing the Full Pipeline

### Local Development

1. Start the API server:

   ```bash
   cd apps/api
   npm run start:dev
   ```

2. Create a test request:

   ```bash
   curl -X POST http://localhost:8002/debug/image-generation/test-request
   ```

3. Watch the logs for `[ORCHESTRATION_START]`, `[ITERATION_START]`, `[EVAL_COMPLETE]`, etc.

4. Check `debug-output/` for detailed results.

### With Mock Images

To test without consuming Gemini API credits:

1. Set `IMAGE_GEN_MOCK=true` in your `.env`
2. Run the test request — the pipeline runs with placeholder images
3. Evaluation still works (judges evaluate the 1x1 pixel image, so scores will be low — this is expected)

### Testing SSE Events

1. Create a request via the debug endpoint
2. Quickly connect to the SSE stream:
   ```bash
   curl -N "http://localhost:8002/organization/{orgId}/image-generation/requests/{requestId}/stream?token={jwt}"
   ```
3. Watch events flow in real-time as the orchestration progresses

### Testing the Frontend

1. Start both the API and web app
2. Navigate to `/iterative-image-generation`
3. Create a new request with test judges
4. The detail page should show real-time progress via SSE

## Logging

The system uses extensive structured logging with tagged prefixes. Key log tags to watch:

| Tag                          | Component     | What It Shows                         |
| ---------------------------- | ------------- | ------------------------------------- |
| `[ORCHESTRATION_START]`      | Orchestration | Request begins processing             |
| `[ITERATION_START]`          | Orchestration | Each iteration begins                 |
| `[STRATEGY_SELECTED]`        | Orchestration | Whether regenerate or edit was chosen |
| `[OPTIMIZATION_COMPLETE]`    | Orchestration | Prompt optimization finished          |
| `[GENERATION_COMPLETE]`      | Orchestration | Images generated                      |
| `[EVAL_COMPLETE]`            | Orchestration | All judges finished                   |
| `[AGGREGATION_RESULT]`       | Orchestration | Best image selected with score        |
| `[ORCHESTRATION_SUMMARY]`    | Orchestration | Final summary with stats              |
| `[GEMINI_GEN_START]`         | Gemini        | API call initiated                    |
| `[GEMINI_GEN_COMPLETE]`      | Gemini        | API call completed with size/timing   |
| `[EVAL_START]`               | Evaluation    | Single judge evaluation started       |
| `[EVAL_RAG_FOUND]`           | Evaluation    | RAG chunks found for context          |
| `[OPTIMIZE_START]`           | Optimizer     | Prompt optimization started           |
| `[NEGATIVE_PROMPTS_UPDATED]` | Orchestration | Negative prompts accumulated          |

## Environment Variables for Testing

| Variable         | Value         | Effect                                      |
| ---------------- | ------------- | ------------------------------------------- |
| `IMAGE_GEN_MOCK` | `true`        | Mock image generation (no Gemini API calls) |
| `NODE_ENV`       | `development` | Enables debug endpoints                     |
| `GEMINI_API_KEY` | your key      | Required for real image generation          |
| `AWS_S3_BUCKET`  | bucket name   | Required for image storage                  |
| `API_PORT`       | `8002`        | The port the API listens on                 |

## Common Debugging Scenarios

### Scores aren't improving

Check the `[EVAL_FEEDBACK]` logs to see what judges are saying. If TOP_ISSUE mentions label accuracy, bottle shape, or object proportions — these are known AI limitations that prompt optimization can't fix (see [Agents & Evaluation](agents-and-evaluation.md#score-plateaus)).

### Evaluation parsing fails

Look for `[PARSE_DEBUG]` logs. If the judge returns malformed JSON, the evaluation falls back to score 50. This usually means the agent's system prompt needs adjustment to produce valid structured JSON output.

### Edit mode keeps falling back to regeneration

Check for `[EDIT_FALLBACK]` logs. The Gemini edit API sometimes rejects edits. The system automatically falls back, but if it happens consistently, the source image may be problematic.

### SSE events not arriving

1. Check that the JWT token is valid (not expired)
2. Verify the request exists and belongs to the correct organization
3. Look for `Subscriber added` logs from `GenerationEventsService`
4. Check that the request is actually processing (not already completed)
