# Generation Modes

The system supports three generation strategies that control how images are produced across iterations. The mode is set when creating a generation request and affects how the orchestration service approaches each iteration.

## The Three Modes

### Regeneration Mode (`regeneration`)

**Default mode.** Every iteration generates completely new images from scratch using an optimized prompt.

```
Iteration 1: Brief → Optimize → Generate new images → Evaluate
Iteration 2: Feedback → Optimize → Generate new images → Evaluate
Iteration 3: Feedback → Optimize → Generate new images → Evaluate
```

**Best for:**

- Initial image creation
- When the overall composition or concept needs to change
- When scores are below 50 (fundamental problems)

### Edit Mode (`edit`)

After the first iteration (which must regenerate since there's no image to edit), subsequent iterations refine the previous best image with targeted edits.

```
Iteration 1: Brief → Optimize → Generate new images → Evaluate
Iteration 2: Best image + TOP_ISSUE → Edit instruction → Edit image → Evaluate
Iteration 3: Best image + TOP_ISSUE → Edit instruction → Edit image → Evaluate
```

**Best for:**

- Fine-tuning images that are already close to the target
- Fixing specific issues (label text, color adjustment, minor composition changes)
- When the overall image is good but has specific flaws

**Limitations:**

- After 5+ consecutive edits, quality may degrade (the service logs warnings)
- Edit instructions are 1–3 sentences (vs 500+ word prompts for regeneration)
- The model sometimes changes aspects that should be preserved

### Mixed Mode (`mixed`)

The system adaptively chooses between regeneration and editing each iteration based on heuristics. This is the most sophisticated mode.

```
Iteration 1: Regenerate (always — no image to edit yet)
Iteration 2: Score 45? → Regenerate (too low for editing)
Iteration 3: Score 65, TOP_ISSUE critical? → Regenerate (fundamental problem)
Iteration 4: Score 72, TOP_ISSUE moderate? → Edit (good foundation, minor fix)
Iteration 5: 3 consecutive edits? → Regenerate (prevent degradation)
Iteration 6: Plateauing at 73? → Edit (try to break through)
```

## Strategy Selection Logic

The `selectIterationStrategy()` method in `OrchestrationService` uses these rules (evaluated in order):

| Rule | Condition                                                 | Strategy                                           |
| ---- | --------------------------------------------------------- | -------------------------------------------------- |
| 1    | Mode is `regeneration`                                    | Always regenerate                                  |
| 2    | Mode is `edit` and iteration > 1                          | Always edit (with degradation warning after 5)     |
| 3    | Iteration is 1                                            | Regenerate (no image to edit)                      |
| 4    | Score < 50                                                | Regenerate (bad foundation)                        |
| 5    | 3+ consecutive edits                                      | Regenerate (prevent degradation)                   |
| 6    | TOP_ISSUE is critical or major                            | Regenerate (fundamental problem needs fresh start) |
| 7    | Score ≥ 50 and TOP_ISSUE is moderate/minor                | Edit (good base, minor fix)                        |
| 8    | Score ≥ 65 and plateauing (last 3 scores vary < 3 points) | Edit (try to break plateau)                        |
| 9    | Default                                                   | Regenerate                                         |

## How Edit Mode Works

When the strategy selects "edit":

1. **Source Image Selection** — Uses the best image from the last iteration (not the overall best, to maintain continuity)

2. **Download from S3** — The source image is downloaded and converted to base64. Images over 2MB trigger a warning (Gemini may compress them).

3. **Build Edit Instruction** — The `PromptOptimizerService.buildEditInstruction()` creates a focused instruction from the highest-severity TOP_ISSUE:

   ```
   Make the Coca-Cola label text sharper and fully legible — the script
   should flow left-to-right without warping or distortion. Keep the
   bottle shape, lighting, and background exactly the same.
   ```

4. **Generate Edits** — The `GeminiImageService.editImages()` applies the instruction to the source image N times in parallel, producing variations.

5. **Fallback** — If the edit API call fails (Gemini sometimes rejects edits), the system automatically falls back to regeneration mode for that iteration.

## Edit Degradation Prevention

Consecutive editing of the same image chain can cause quality degradation (similar to repeatedly re-saving a JPEG). The system prevents this:

- In `mixed` mode: forces regeneration after 3 consecutive edits
- In `edit` mode: logs a warning after 5 consecutive edits
- The `consecutiveEditCount` is tracked per iteration and persisted in the iteration snapshot
- When falling back to regeneration (due to edit failure), the counter resets to 0

## Choosing the Right Mode

| Scenario                                | Recommended Mode                   |
| --------------------------------------- | ---------------------------------- |
| New product photography                 | `mixed`                            |
| Iterating on an existing good image     | `edit`                             |
| Exploratory creative work               | `regeneration`                     |
| Brand compliance with strict guidelines | `mixed`                            |
| Quick single-pass generation            | `regeneration` with 1–3 iterations |

## Setting the Mode

The mode is specified in the `RequestCreateDto` when creating a generation request:

```json
{
  "brief": "A Coca-Cola bottle on marble...",
  "judgeIds": ["uuid1", "uuid2"],
  "generationMode": "mixed",
  "maxIterations": 10,
  "threshold": 85
}
```

The mode can also be changed when continuing a completed request:

```json
POST /requests/:id/continue
{
  "generationMode": "edit",
  "additionalIterations": 5
}
```
