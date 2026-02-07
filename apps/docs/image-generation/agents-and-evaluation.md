# Judge Agents & Evaluation

Judge agents are the quality gatekeepers of the image generation system. Each agent is an AI evaluator with a custom system prompt, configurable scoring weights, and optional RAG documents that provide domain-specific evaluation guidelines.

## What is a Judge Agent?

A judge agent evaluates generated images against the original brief and returns structured feedback. You might have:

- A **Brand Compliance** judge that checks logos, colors, and brand guidelines
- A **Composition** judge that evaluates lighting, framing, and visual balance
- A **Product Accuracy** judge that verifies product shapes, labels, and proportions
- A **Technical Quality** judge that checks resolution, artifacts, and realism

Each judge operates independently and can be weighted differently. A brand compliance judge might have a `scoringWeight` of 80 while a composition judge has 50, meaning brand compliance has more influence on the aggregate score.

## Agent Entity

**Source:** `apps/api/src/image-generation/entities/agent.entity.ts`

| Field                  | Type           | Description                                                   |
| ---------------------- | -------------- | ------------------------------------------------------------- |
| `id`                   | UUID           | Primary key                                                   |
| `organizationId`       | UUID           | Owning organization (multi-tenant isolation)                  |
| `name`                 | string         | Human-readable name (e.g., "Brand Compliance Judge")          |
| `systemPrompt`         | text           | The agent's personality and evaluation instructions           |
| `evaluationCategories` | text           | Optional category definitions the agent should score          |
| `scoringWeight`        | number (0–100) | How much this agent's score influences the aggregate          |
| `optimizationWeight`   | number (0–100) | How much this agent's feedback influences prompt optimization |
| `ragConfig`            | JSONB          | RAG search configuration: `{ topK, similarityThreshold }`     |
| `templateId`           | string         | Optional template reference for pre-built agent types         |
| `documents`            | relation       | Uploaded reference documents for RAG context                  |
| `deletedAt`            | timestamp      | Soft-delete marker                                            |

## System Prompt Design

The agent's `systemPrompt` is the most important configuration. It defines how the agent evaluates images and what output format it uses.

**Key rule:** If the system prompt includes the text `"OUTPUT FORMAT"`, the evaluation service assumes the agent defines its own response format and skips adding the default format instructions. If it doesn't include `"OUTPUT FORMAT"`, the service appends a default structured JSON format.

### Default Output Format

When an agent doesn't specify its own format, the evaluation service requests:

```json
{
  "score": 75,
  "TOP_ISSUE": {
    "problem": "Bottle label text is distorted and unreadable",
    "severity": "critical",
    "fix": "Ensure the label text reads 'RESERVE 18' in gold serif font, flowing left-to-right without warping"
  },
  "categoryScores": {
    "brandAccuracy": 60,
    "composition": 85,
    "technicalQuality": 80
  },
  "whatWorked": [
    "Lighting is dramatic and well-balanced",
    "Background marble texture is realistic"
  ],
  "promptInstructions": [
    "The bottle label must read RESERVE 18 in gold serif font",
    "Add rim lighting at 5600K from behind the subject"
  ],
  "feedback": "The image captures the mood well but the label accuracy is poor..."
}
```

### Evaluation Response Fields

| Field                | Purpose                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `score`              | Overall score from 0–100                                                                                                                                                                 |
| `TOP_ISSUE`          | The single most important problem to fix. Contains `problem`, `severity` (critical/major/moderate/minor), and `fix`. This is critical — it drives the prompt optimizer's prioritization. |
| `categoryScores`     | Per-category breakdown matching the agent's `evaluationCategories`                                                                                                                       |
| `whatWorked`         | List of positive aspects that should be preserved in future iterations                                                                                                                   |
| `promptInstructions` | Exact text snippets that should appear verbatim in the next generation prompt                                                                                                            |
| `checklist`          | Pass/fail checklist items with optional notes                                                                                                                                            |
| `feedback`           | Detailed narrative feedback                                                                                                                                                              |

## Evaluation Pipeline

**Source:** `apps/api/src/image-generation/orchestration/evaluation.service.ts`

### Single Image Evaluation

`evaluateImage(agent, image, brief, iterationContext)`:

1. **RAG Search** — If the agent has uploaded documents, search for relevant chunks using the brief + prompt as the query. Default: `topK=5`, `similarityThreshold=0.7`.

2. **Build Prompt** — Constructs the evaluation prompt with:
   - Task header
   - Iteration context (current iteration, max iterations, previous scores)
   - Original brief
   - Prompt used for generation
   - RAG context (as "Reference Guidelines")
   - Agent's evaluation categories
   - Response format (unless agent specifies its own)

3. **LLM Call** — Sends the system prompt + evaluation prompt + image to `gemini-2.0-flash` with temperature 0.3 (for consistent scoring).

4. **Parse Response** — Extracts JSON from the LLM response. Handles both `TOP_ISSUE` and `topIssue` key formats. Falls back to score 50 if parsing fails.

### Multi-Judge Evaluation

`evaluateWithAllJudges(agents, image, brief, iterationContext)`:

Runs `evaluateImage()` for all agents in parallel using `Promise.all()`. Returns an array of `EvaluationResult` objects.

### Aggregation

`aggregateEvaluations(evaluationsByImage)`:

For each image, computes the weighted average:

```
aggregate = Σ(score_i × weight_i) / Σ(weight_i)
```

Images are ranked by aggregate score descending. The top image becomes the iteration winner.

## Iteration Context

To prevent score inflation, judges receive context about the iteration:

```
This is iteration 3 of 10. Previous scores: [62, 68, 70].
Score the image on its absolute merits. If this iteration genuinely improved
on previous issues, the score SHOULD increase. If the same problems persist,
the score should NOT increase. Do not inflate scores just because this is a
later iteration.
```

This helps judges maintain consistent scoring across iterations rather than artificially increasing scores.

## Score Plateaus

AI image generation has fundamental limitations that typically cause scores to plateau around 70–75%:

1. **Bottle/product shapes** — AI can't consistently render correct product contours
2. **Object proportions** — Glass/bottle ratios are often wrong
3. **Label accuracy** — Text distortion is common (a known AI artifact)

These are inherent to the generation model, not fixable by prompt optimization. The plateau detection mechanism (default: 3-iteration window, 2% threshold) catches this and stops wasting iterations.

## Managing Agents via the API

All agent endpoints are under `/organization/:orgId/agents` and require Admin or SuperAdmin role.

| Method                         | Path              | Description                                |
| ------------------------------ | ----------------- | ------------------------------------------ |
| `GET /`                        | List agents       | Supports `query`, `sortBy`, `order` params |
| `GET /:id`                     | Get agent detail  | Includes document list                     |
| `POST /`                       | Create agent      | Requires name, systemPrompt                |
| `PUT /:id`                     | Update agent      | Partial updates supported                  |
| `DELETE /:id`                  | Soft-delete agent | Sets `deletedAt`, doesn't destroy data     |
| `GET /:id/documents`           | List documents    | Returns processed documents                |
| `POST /:id/documents`          | Upload document   | Accepts file upload (PDF, DOCX)            |
| `DELETE /:id/documents/:docId` | Delete document   | Removes from S3 and database               |

See [API Reference](api-reference.md) for full request/response details.
