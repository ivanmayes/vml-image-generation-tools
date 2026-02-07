# Prompt Optimization

The `PromptOptimizerService` is responsible for turning judge feedback into better image generation prompts. It's the learning mechanism that makes the iterative loop improve over time rather than just regenerating blindly.

**Source:** `apps/api/src/image-generation/prompt-optimizer/prompt-optimizer.service.ts`

## How It Works

The optimizer is a singleton service with a persisted configuration (stored as the `PromptOptimizer` entity in the database). It uses an LLM to transform the original brief + judge feedback into detailed, structured prompts.

### Prompt Optimization Flow

```
Original Brief
     +
Judge Feedback (scores, TOP_ISSUE, whatWorked, promptInstructions)
     +
RAG Context (from agent documents)
     +
Negative Prompts (accumulated problems to avoid)
     +
Previous Prompts (to avoid repetition)
     │
     ▼
  PromptOptimizerService.optimizePrompt()
     │
     ▼
  500–1000+ word structured prompt
  (5 sections: TECHNICAL PARAMETERS, COMPOSITION & NARRATIVE,
   SETTING & AMBIANCE, KEY OBJECTS, FINAL NOTES)
```

## The Optimization Message

The optimizer builds a comprehensive context message for the LLM, assembled in this priority order:

1. **Original Brief** — The user's original request
2. **Reference Images** — If the request includes reference images, the optimizer mandates explicit instructions to match their visual style
3. **Current Prompt** — The prompt used in the previous iteration (if iterating)
4. **CRITICAL ISSUES TO FIX** — TOP_ISSUES from all judges, sorted by severity (critical → major → moderate → minor), then by judge weight
5. **WHAT WORKED** — Deduplicated list of positive aspects from all judges that should be preserved
6. **Things to Avoid** — The accumulated negative prompts
7. **Reference Guidelines** — RAG context from agent documents
8. **Detailed Judge Feedback** — Full feedback from each judge, sorted by weight (highest influence first)
9. **Previous Attempts** — Truncated previous prompts to avoid repetition
10. **JUDGE PROMPT INSTRUCTIONS** — Exact text snippets from judges that must appear verbatim in the output

The task instruction at the end mandates:

- At least 500 words
- Organized into 5 sections
- Address critical issues first, in priority order
- Preserve what worked
- Include judge prompt instructions verbatim

## TOP_ISSUE Prioritization

The TOP_ISSUE mechanism is crucial for effective optimization. Instead of the optimizer trying to fix everything at once, it focuses on the single most important problem from each judge:

```
1. [CRITICAL] Brand Compliance Judge: Bottle label text is distorted
   FIX: Ensure the label text reads 'RESERVE 18' in gold serif font

2. [MAJOR] Composition Judge: Product is off-center
   FIX: Center the bottle in the frame with 20% negative space on each side
```

Issues are sorted by severity first, then by judge weight. This ensures the optimizer addresses the most impactful problems before minor ones.

## Edit Instructions

For the **edit** generation mode, the optimizer produces a different output. Instead of a full 500+ word prompt, `buildEditInstruction()` generates a focused 1–3 sentence edit instruction:

```
Make the Coca-Cola label text sharper and fully legible — the script should
flow left-to-right without warping or distortion. Keep the bottle shape,
lighting, and background exactly the same.
```

The edit instruction builder:

- Takes the highest-severity TOP_ISSUE as the primary fix target
- Includes elements that worked well (as things to preserve)
- Uses lower temperature (0.3) for focused, deterministic output
- If no issues exist, generates a generic refinement instruction

## Prompt Instructions (Verbatim)

The `promptInstructions` field from judge evaluations contains exact text that must appear in the next prompt. Unlike general feedback, these are specific, actionable instructions:

- "Add rim lighting at 5600K from behind the subject"
- "The bottle label must read RESERVE 18 in gold serif font"
- "Use a shallow depth of field with f/2.8 aperture simulation"

The optimizer is instructed to include these verbatim — not paraphrase them.

## Negative Prompt Accumulation

Across iterations, the orchestration service accumulates a "negative prompts" list — things the image generation should avoid. This list:

- Is extracted from TOP_ISSUE feedback after each iteration
- Sorted by severity (critical issues first)
- Deduplicated to avoid repetition
- Capped at 10 entries to prevent the prompt from becoming too long
- Formatted as: `AVOID: [problem] - [fix] (from [agent])`

The negative prompts are passed to the optimizer as "Things to Avoid" context.

## Optimizer Configuration

The optimizer's behavior can be customized via the `PromptOptimizer` entity:

| Field                | Default                    | Description                                                 |
| -------------------- | -------------------------- | ----------------------------------------------------------- |
| `systemPrompt`       | `DEFAULT_OPTIMIZER_PROMPT` | The LLM system prompt that defines the optimizer's behavior |
| `config.model`       | `gemini-2.0-flash`         | Which LLM model to use for optimization                     |
| `config.temperature` | `0.7`                      | LLM temperature (higher = more creative prompts)            |
| `config.maxTokens`   | default                    | Maximum output tokens                                       |

The default system prompt (`DEFAULT_OPTIMIZER_PROMPT`) mandates structured output with specific sections and minimum length. It's stored as a constant in the entities module and applied in the service layer (not as a database default, to avoid TypeORM SQL escaping issues).

## API Endpoints

| Method                                                       | Path                    | Description |
| ------------------------------------------------------------ | ----------------------- | ----------- |
| `GET /organization/:orgId/image-generation/prompt-optimizer` | Read optimizer config   |
| `PUT /organization/:orgId/image-generation/prompt-optimizer` | Update optimizer config |

## RAG Context for Optimization

Before generating the optimized prompt, the orchestration service gathers RAG context from all judge agents' documents:

```typescript
const ragContext = await this.promptOptimizerService.getAgentRagContext(
  agentsWithDocs,
  request.brief,
);
```

This searches each agent's document chunks for content relevant to the brief, combining results into a single reference context string that the optimizer can use to ground its prompts in domain-specific knowledge.
