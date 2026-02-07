# Image Generation System

## What It Does

The image generation system is the core feature of this platform. It takes a text brief (e.g., "A Coca-Cola bottle on a marble countertop with dramatic side lighting") and produces high-quality AI-generated images through an **iterative refinement loop**. Instead of generating a single image and hoping for the best, the system generates, evaluates, and refines images across multiple iterations until they meet a quality threshold.

Think of it as an automated creative director: it generates images, has AI judges critique them, feeds that feedback into an optimizer that rewrites the prompt, then generates again — repeating until the image is good enough or it runs out of iterations.

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Generation Request                           │
│  brief + judges + parameters + threshold + max iterations           │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Orchestration Service                            │
│                                                                      │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│   │ Prompt   │───▶│ Gemini   │───▶│ Judge    │───▶│ Check        │  │
│   │ Optimize │    │ Generate │    │ Evaluate │    │ Termination  │  │
│   └──────────┘    └──────────┘    └──────────┘    └──────┬───────┘  │
│        ▲                                                  │          │
│        │            ◄── Iteration Loop ──►                │          │
│        └──────────────────────────────────────────────────┘          │
│                                                                      │
│   Events: STATUS_CHANGE → ITERATION_COMPLETE → COMPLETED/FAILED     │
└──────────────────────────────────────────────────────────────────────┘
```

## Key Concepts

| Concept              | Description                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Brief**            | The user's plain-language description of what they want generated                                                  |
| **Judge Agent**      | An AI evaluator with a custom system prompt that scores generated images                                           |
| **Iteration**        | One cycle of optimize → generate → evaluate                                                                        |
| **Threshold**        | The target score (0–100) at which the system considers the image "good enough"                                     |
| **Generation Mode**  | Whether to generate fresh images (`regeneration`), edit the previous best (`edit`), or adaptively choose (`mixed`) |
| **TOP_ISSUE**        | The single most important problem identified by a judge in each evaluation                                         |
| **Negative Prompts** | Accumulated list of problems to avoid, extracted from judge feedback                                               |
| **RAG Context**      | Reference documents uploaded to judges that provide domain-specific evaluation guidelines                          |

## The Iteration Loop

Each iteration follows this sequence:

1. **Prompt Optimization** — The PromptOptimizerService takes the original brief, judge feedback from the previous iteration, and RAG context, then generates a detailed 500–1000+ word prompt organized into structured sections.

2. **Image Generation** — The GeminiImageService calls Google's `gemini-3-pro-image-preview` model to generate N images (configurable, default 3) in parallel.

3. **Multi-Judge Evaluation** — Each generated image is evaluated by all selected judge agents in parallel. Judges return structured JSON with scores, category breakdowns, TOP_ISSUE, and feedback.

4. **Aggregation & Selection** — Scores are aggregated using weighted averages across judges. The best-scoring image is selected as the iteration winner.

5. **Termination Check** — The system checks whether to stop (threshold met, plateau detected, max iterations reached) or continue iterating.

## Termination Conditions

The loop ends when any of these conditions is met:

- **Threshold Met** — The best image's aggregate score meets or exceeds the target threshold
- **Plateau Detected** — Scores across the last N iterations (default 3) show less than 2% variance, indicating diminishing returns
- **Max Iterations Reached** — The configured maximum number of iterations has been exhausted
- **Timeout** — The orchestration has exceeded 10 minutes total
- **User Cancellation** — The user explicitly cancels the request

## Module Structure

The image generation system lives under `apps/api/src/image-generation/` and is composed of these sub-modules:

```
image-generation/
├── agent/                    # Judge agent CRUD and document management
├── debug.controller.ts       # Dev-only test endpoints (no auth)
├── document-processor/       # RAG document parsing, chunking, embeddings
├── entities/                 # TypeORM entities, enums, interfaces
├── generation-request/       # Request CRUD, SSE streaming, continuation
├── image-generation.module.ts
├── jobs/                     # Async job queue for orchestration
├── orchestration/            # Core pipeline: orchestration, generation, evaluation
└── prompt-optimizer/         # LLM-based prompt refinement
```

## What to Read Next

- [Orchestration Pipeline](orchestration.md) — Deep dive into how the loop executes
- [Judge Agents & Evaluation](agents-and-evaluation.md) — How images are scored
- [Prompt Optimization](prompt-optimization.md) — How prompts are refined between iterations
- [Gemini Integration](gemini-integration.md) — Image generation via the Gemini API
- [RAG Documents](rag-documents.md) — Uploading reference documents to agents
- [Events & Streaming](events-and-streaming.md) — Real-time SSE events
- [Generation Modes](generation-modes.md) — Regeneration vs. edit vs. mixed strategies
- [API Reference](api-reference.md) — Complete endpoint documentation
- [Debug & Testing](debug-and-testing.md) — Development tools and mock mode
