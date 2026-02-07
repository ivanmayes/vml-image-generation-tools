---
title: "Edit Mode / Mixed Mode for Iterative AI Image Generation"
date: 2026-02-07
category: feature-implementation
module: apps/api/src/image-generation
tags:
  - gemini
  - image-generation
  - image-editing
  - edit-mode
  - mixed-mode
  - orchestration
  - prompt-optimization
  - ai-judge
  - evaluation
  - iterative-refinement
  - strategy-pattern
  - nestjs
  - typeorm
  - google-genai
description: >
  Adaptive iteration strategy that uses Gemini image editing alongside prompt
  regeneration to improve AI-generated images. Includes edit mode (targeted fixes),
  mixed mode (adaptive heuristics), degradation prevention, and edit-to-regeneration
  fallback. Uses the same generateContent API with source images in contents.
related_docs:
  - docs/plans/2026-02-06-feat-image-generation-edit-mode-plan.md
  - apps/api/src/image-generation/prompts/gemini-image-editing-research.md
  - docs/solutions/code-quality/bulk-image-compliance-8-agent-review-fixes.md
---

# Edit Mode / Mixed Mode for Iterative AI Image Generation

Adds intelligent editing capabilities to the image generation pipeline. Instead of always regenerating images from scratch each iteration, the system can now edit the previous best image with targeted instructions based on judge feedback.

## Generation Strategy Modes

The `GenerationMode` enum defines three strategies:

| Mode             | Behavior                                                          | Use Case                                    |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| **REGENERATION** | Generate new image from optimized prompt each iteration           | Default; major structural issues            |
| **EDIT**         | Send previous best image to Gemini with targeted edit instruction | Specific, localized fixes                   |
| **MIXED**        | Adaptively select between regeneration and editing                | Production; balances quality and efficiency |

## Strategy Selection Flow (Mixed Mode)

```
Iteration 1 ────────────────────────────────── REGENERATE (no image exists)

Iteration 2+:
  Score < 40 ────────────────────────────────── REGENERATE (fundamentally flawed)
  Score 40-65 ───────────────────────────────── REGENERATE (building foundation)
  Score >= 65 + moderate/minor TOP_ISSUE
    + consecutiveEdits < 3 ──────────────────── EDIT (targeted fix)
  After 3 consecutive edits ─────────────────── REGENERATE (prevent degradation)
  Critical/major TOP_ISSUE ──────────────────── REGENERATE (needs fresh start)
```

## Core Components

### 1. Gemini Image Editing Service

**File**: `apps/api/src/image-generation/orchestration/gemini-image.service.ts`

**`editImage(sourceImageBase64, editInstruction, options)`** sends a source image + instruction to Gemini's `generateContent` API:

```typescript
const contents: any[] = [
  { inlineData: { mimeType: "image/jpeg", data: sourceImageBase64 } },
  { text: editInstruction },
];

const result = await this.client.models.generateContent({
  model: "gemini-3-pro-image-preview",
  contents,
  config: { responseModalities: ["TEXT", "IMAGE"] },
});
```

**`editImages(sourceImageBase64, editInstruction, count, options)`** runs multiple edits in parallel from the SAME source image (not chained) to produce variations while avoiding compounding artifacts.

Key: Uses `@google/genai` SDK (NOT `@google/generative-ai`). Same `generateContent` call as generation, just with source image added to `contents`.

### 2. Strategy Selection

**File**: `apps/api/src/image-generation/orchestration/orchestration.service.ts` -> `selectIterationStrategy()`

```typescript
private selectIterationStrategy(
  mode: GenerationMode,
  iteration: number,
  currentScore: number,
  previousScores: number[],
  topIssueSeverity: string | undefined,
  consecutiveEditCount: number,
): 'regenerate' | 'edit'
```

| Condition                                   | Strategy   | Rationale                     |
| ------------------------------------------- | ---------- | ----------------------------- |
| REGENERATION mode                           | regenerate | Forced by user                |
| EDIT mode, iteration > 1                    | edit       | Forced, warn at 5 consecutive |
| MIXED, iteration 1                          | regenerate | No previous image             |
| MIXED, consecutiveEdits >= 3                | regenerate | Prevent degradation           |
| MIXED, severity critical/major              | regenerate | Needs fresh start             |
| MIXED, score >= 65, severity moderate/minor | edit       | Targeted fix viable           |
| MIXED, score < 65                           | regenerate | Still building foundation     |

### 3. Edit Instruction Builder

**File**: `apps/api/src/image-generation/prompt-optimizer/prompt-optimizer.service.ts` -> `buildEditInstruction()`

Converts judge TOP_ISSUE feedback into concise 1-3 sentence edit instructions:

```
Fix the distorted label text on the bottle. The text should be clearly
readable and properly oriented. Keep the rest of the image exactly the same.
```

Takes highest-severity issue only. Includes `whatWorked` context to preserve good elements.

### 4. Orchestration Integration

**File**: `apps/api/src/image-generation/orchestration/orchestration.service.ts`

Two paths in the iteration loop:

**Edit path:**

1. Download best image from S3 as base64 (`downloadImageAsBase64()`)
2. Build edit instruction from judge feedback (parallel with S3 download)
3. Call `editImages()` to generate edited versions
4. On failure: automatic fallback to `generateImages()` with current prompt
5. Increment `consecutiveEditCount`

**Regeneration path:**
Existing behavior, unchanged. Resets `consecutiveEditCount` to 0.

### 5. Entity Changes

**`GenerationMode` enum** (`generation-request.entity.ts`):

```typescript
export enum GenerationMode {
  REGENERATION = "regeneration",
  EDIT = "edit",
  MIXED = "mixed",
}
```

**`IterationSnapshot` extensions:**

| Field                  | Type                       | Purpose                                           |
| ---------------------- | -------------------------- | ------------------------------------------------- |
| `mode`                 | `'regeneration' \| 'edit'` | Which strategy was used                           |
| `editSourceImageId`    | `string?`                  | Image sent to Gemini for editing                  |
| `consecutiveEditCount` | `number?`                  | Edit chain length (persists across continuations) |

**`TopIssueSnapshot` interface:**

```typescript
interface TopIssueSnapshot {
  problem: string;
  severity: "critical" | "major" | "moderate" | "minor";
  fix: string;
}
```

## Design Decisions

### Same API for Editing

Uses Gemini's `generateContent` with source image in `contents` (not the separate Imagen `editImage` API). This maintains SDK consistency with existing generation code and works with our current model.

### Parallel Edits from Same Source

All edits start from the SAME source image, not chained sequentially. Chaining compounds JPEG re-encoding artifacts.

### Graceful Fallback

Edit failures caught and automatically fall back to regeneration. The iteration continues rather than failing the entire request.

### Conservative Edit Limits

Research (documented in `gemini-image-editing-research.md` Section 7) shows quality degradation after 3-5 edits. Mixed mode enforces max 3 consecutive edits. Edit mode warns at 5.

### TOP_ISSUE Driven Edits

Single-issue focus per edit. Gemini performs better with focused instructions than compound changes.

## Quality Degradation Timeline

| Round     | Artifact Level | Notes                                               |
| --------- | -------------- | --------------------------------------------------- |
| 1-2 edits | Minimal        | Targeted edits faithful to instruction              |
| 3-4 edits | Subtle drift   | Fine details soften, slight color shift             |
| 5+ edits  | Noticeable     | JPEG artifacts compound, unintended changes         |
| 7+ edits  | Significant    | Google recommends restarting with fresh description |

Mitigation: Max 3 consecutive edits in MIXED mode forces regeneration refresh.

## Gotchas

### TypeORM Enum Columns

The `generationMode` column uses a PostgreSQL enum type. Existing databases need a migration to create the enum type AND add the column. Never use `@Column({ default: "string with 'quotes'" })` -- TypeORM generates unescaped SQL.

### Base64 Size Expansion

A 2MB JPEG becomes ~2.7MB as base64. Images >2MB trigger a warning log. Gemini may internally compress large images, compounding quality loss.

### Edit Mode Requires Previous Image

Iteration 1 ALWAYS regenerates regardless of mode setting. Edits begin on iteration 2.

### ConsecutiveEditCount Persistence

The counter is stored in `IterationSnapshot` and reconstructed from the last snapshot when a request is continued. This ensures the degradation guard works across continuation boundaries.

### Mock Mode

Set `IMAGE_GEN_MOCK=true` in environment. Both `generateImage()` and `editImage()` return 1x1 pixel placeholder images without API calls.

## Testing Priorities

### Critical Path Tests

- REGENERATION mode: all iterations use full regeneration (no regressions)
- EDIT mode: iteration 1 regenerates, iterations 2+ edit
- MIXED mode: strategy varies based on heuristics, edits capped at 3
- Edit failure: automatic fallback to regeneration, counter reset
- Continue request: `consecutiveEditCount` reconstructed from last snapshot

### Edge Cases

- Score exactly at threshold boundaries (40, 65)
- No TOP_ISSUE from judges (defaults to regenerate)
- Image >2MB (warning logged, edit succeeds)
- Critical severity in EDIT mode (still warns, but proceeds per user's forced mode)

## Monitoring

Key log patterns:

```
[STRATEGY_SELECTED]   Mode + strategy + consecutive edit count
[GEMINI_EDIT_START]   Edit instruction + source size
[GEMINI_EDIT_COMPLETE] Result size + API time
[EDIT_FALLBACK]       Edit failed, falling back to regeneration
[EDIT_DEGRADATION]    5+ consecutive edits warning
[EDIT_SIZE_WARNING]   Source image >2MB
```

Alert on: `[EDIT_FALLBACK]` spike (API issue), `consecutiveEdits > 3` in MIXED mode (broken heuristics).

## Related Files

| File                                                            | Purpose                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `orchestration/gemini-image.service.ts`                         | `editImage()`, `editImages()`, `generateImage()`                  |
| `orchestration/orchestration.service.ts`                        | `selectIterationStrategy()`, `downloadImageAsBase64()`, main loop |
| `prompt-optimizer/prompt-optimizer.service.ts`                  | `buildEditInstruction()`                                          |
| `entities/generation-request.entity.ts`                         | `GenerationMode` enum, `IterationSnapshot`, `TopIssueSnapshot`    |
| `generation-request/dtos/request-create.dto.ts`                 | `generationMode` field validation                                 |
| `prompts/gemini-image-editing-research.md`                      | Research document on Gemini editing capabilities and degradation  |
| `docs/plans/2026-02-06-feat-image-generation-edit-mode-plan.md` | Implementation plan with 6 phases                                 |

## Future Improvements

1. **Multi-shot per iteration**: Generate multiple edit variants, let judges pick best
2. **Negative prompt accumulation**: Track failed edit attempts to avoid repeating them
3. **Reference image comparison**: Include reference alongside edit instruction for precision
4. **Adaptive heuristics**: ML model predicts best strategy per iteration based on history
5. **Lossless format**: Request PNG/WebP from Gemini to eliminate JPEG re-encoding loss
6. **Image caching**: Cache recently-used source images in memory for faster S3 reads
