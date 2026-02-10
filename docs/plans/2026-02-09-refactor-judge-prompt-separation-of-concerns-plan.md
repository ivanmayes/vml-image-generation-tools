---
title: "Separate Judge Prompt from Agent System Prompt"
type: refactor
date: 2026-02-09
revised: true
---

# Separate Judge Prompt from Agent System Prompt

## Overview

Extract the structured judging output format from `agent.systemPrompt` into a shared code-level template, with an optional per-agent `judgePrompt` column for specialized judges. Add a "Judging" tab to the agent edit page to group all judge-specific configuration. Replace the fragile `includes('OUTPUT FORMAT')` sentinel check with explicit prompt composition.

## Problem Statement

`evaluation.service.ts:321` uses a fragile string check to decide whether to append a fallback JSON format:

```typescript
if (!agent.systemPrompt?.includes('OUTPUT FORMAT')) {
```

This breaks silently if a prompt author uses different heading text. It also forces agents to embed the full JSON schema in `systemPrompt`, coupling the agent's personality/role with the judge output contract.

Additionally, judge-specific fields (`evaluationCategories`, `scoringWeight`, `optimizationWeight`) are scattered across the Prompts tab and Weights & RAG tab, making it hard for users to understand which settings affect judging behavior.

## Proposed Solution

### 1. Shared Judge Template (Code Constant)

Create `apps/api/src/image-generation/prompts/default-judge-template.ts` with a `DEFAULT_JUDGE_TEMPLATE` constant containing:

- **Scoring calibration** -- anchor descriptions for score bands
- **Structured output format** -- the canonical JSON schema: `score`, `TOP_ISSUE`, `checklist`, `categoryScores`, `whatWorked`, `promptInstructions`, `feedback`
- **Evaluation instructions** -- how to assess the image against the brief

Follows the same pattern as `DEFAULT_OPTIMIZER_PROMPT` in `apps/api/src/image-generation/entities/prompt-optimizer.entity.ts`.

The `checklist` field IS included in the canonical schema (it exists in the `EvaluationResult` interface at `evaluation.service.ts:26-37` and is used in iteration snapshots). Domain-specific content (brand reference specs, product measurements) stays in the agent's `systemPrompt`, NOT in the template.

The `promptInstructions` field explanation from the current fallback (lines 343-348) must be preserved in the template -- without it, judges produce vague instructions instead of verbatim text snippets.

### 2. Agent-Level Judge Prompt (`judgePrompt`)

Add a nullable `judgePrompt` text column to the Agent entity. When set, it **replaces** the shared template entirely for that agent. This supports specialized judges like the ShopX POS evaluator (`cce-shopx-judge.md`).

Named `judgePrompt` (not `judgePromptOverride`) -- setting a custom judge prompt is the power-user path, not an exception.

When `judgePrompt` is `null`, the system uses `DEFAULT_JUDGE_TEMPLATE`. The composition reads naturally as:

```typescript
agent.judgePrompt || DEFAULT_JUDGE_TEMPLATE
```

> **Implementation note**: Uses `||` (not `??`) so that an empty-string `judgePrompt` also falls back to the default template. The DTO also normalizes whitespace-only strings to `null` via `@Transform`.

### 3. Prompt Composition at Evaluation Time

In `EvaluationService.evaluateImage()`, extract a private method:

```typescript
private composeJudgeSystemMessage(agent: Agent): string {
  return agent.systemPrompt
    + '\n\n---\n\n'
    + (agent.judgePrompt || DEFAULT_JUDGE_TEMPLATE);
}
```

This replaces the `includes('OUTPUT FORMAT')` check entirely. The system message becomes the concatenation; the fallback format block in `buildEvaluationPrompt()` (lines 321-348) is deleted.

### 4. Data Migration for Existing Agents

Write a one-time migration that:
1. Finds agents where `systemPrompt` contains `## OUTPUT FORMAT` or `## REQUIRED OUTPUT FORMAT`
2. Extracts the output format section into the new `judgePrompt` column
3. Strips the output format section from `systemPrompt`

This eliminates the need for any backward compatibility runtime detection. No sentinel checks, no dual code paths.

### 5. Judging Tab on Agent Edit Page

Add a new "Judging" tab (value `"4"`) to the agent edit page at `apps/web/src/app/pages/organization-admin/judges/judge-detail/judge-detail.page.html`. This tab contains:

- **Evaluation Categories** -- textarea (moved from Prompts tab, line 174-191)
- **Scoring Weight** -- number input (moved from Weights & RAG tab, line 429-439)
- **Optimization Weight** -- number input (moved from Weights & RAG tab, line 416-426)
- **Judge Prompt** -- new textarea, optional. Placeholder: "Leave empty to use the default judge template. Set to completely replace it."
- **Info banner** when `canJudge` is false: "This agent is not configured as a judge. Enable judging on the General tab to use these settings."

The Prompts tab (value `"1"`) keeps: systemPrompt, teamPrompt, aiSummary.
The Weights & RAG tab (value `"4"`) keeps: templateId, RAG configuration.

### 6. OrchestrationService `canJudge` Guard

Add a runtime guard in `orchestration.service.ts` after loading agents by `judgeIds`: filter out agents with `canJudge: false` and log a warning. If the filtered list is empty, fail fast with a clear error message rather than silently producing zero evaluations.

## Technical Considerations

### Prompt Placement

The judge template goes into the **system message** (concatenated after `systemPrompt`). The user message continues to contain per-evaluation context (brief, image, RAG context, iteration history) via `buildEvaluationPrompt()`, but no longer contains any output format.

### `toPublic()` Method

The Agent entity's `toPublic()` method (line 201 of `agent.entity.ts`) must include `judgePrompt` in the serialized output.

### DTO Null-Clearing

The update DTO must allow `judgePrompt: null` to clear a custom prompt (reverting to default template). Use `@IsOptional()` with `@ValidateIf((o) => o.judgePrompt !== null)` and `@IsString()` so that both `null` (clear) and `undefined` (no change) are handled correctly.

### `canJudge` Toggle and `judgePrompt` Persistence

When `canJudge` is toggled to `false`, `judgePrompt` persists. The user may toggle it back on and expect their custom prompt to still be there.

### Debug Controller

No changes. The debug controller is dev-only (`NODE_ENV !== 'production'`) and creates ephemeral test agents. It can keep its self-contained inline prompts.

## Acceptance Criteria

### Functional

- [x] `DEFAULT_JUDGE_TEMPLATE` constant exists with scoring calibration, structured JSON output format (including `checklist`), and `promptInstructions` explanation
- [x] Agent entity has a new nullable `judgePrompt` text column
- [x] `EvaluationService` has a `composeJudgeSystemMessage()` private method that concatenates `systemPrompt + (judgePrompt || DEFAULT_JUDGE_TEMPLATE)`
- [x] The `includes('OUTPUT FORMAT')` check and fallback format in `buildEvaluationPrompt()` are deleted
- [x] Data migration extracts OUTPUT FORMAT blocks from existing agents' `systemPrompt` into `judgePrompt`
- [x] Agent edit page has a "Judging" tab with evaluationCategories, scoringWeight, optimizationWeight, and judgePrompt
- [x] evaluationCategories removed from Prompts tab; weights removed from Weights & RAG tab
- [x] Judging tab visible when `canJudge` is false, with info banner
- [x] `judgePrompt` can be set to `null` via the update API to revert to default template
- [x] `toPublic()` includes `judgePrompt`
- [x] Agent export/import includes `judgePrompt` (absent on import = `null`)
- [x] OrchestrationService filters out agents with `canJudge: false` at runtime with warning log
- [x] OrchestrationService fails fast with clear error if all judges filtered out

### Non-Functional

- [ ] No evaluation score regression -- run same images through old and new prompt composition, compare scores *(requires staging verification)*
- [x] TypeORM migration does NOT use a long string default (per project convention)

## Dependencies & Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Score regression from prompt restructuring | High | A/B test: same images, old vs new composition, compare scores before merging |
| Data migration splits prompts incorrectly | Medium | Preview migration output on staging data; manual verification of extracted prompts |
| Template too generic for specialized judges | Low | `judgePrompt` provides full escape hatch |

## File Change Inventory

| File | Change | Description |
|------|--------|-------------|
| `apps/api/src/image-generation/prompts/default-judge-template.ts` | **New** | `DEFAULT_JUDGE_TEMPLATE` constant |
| `apps/api/src/agent/agent.entity.ts` | Edit | Add `judgePrompt` column; update `toPublic()` |
| `apps/api/src/agent/dtos/agent-create.dto.ts` | Edit | Add `judgePrompt` field |
| `apps/api/src/agent/dtos/agent-update.dto.ts` | Edit | Add `judgePrompt` field with null-clearing support |
| `apps/api/src/agent/export/agent-export.service.ts` | Edit | Add `judgePrompt` to `VmlAgentJson` and import/export logic |
| `apps/api/src/image-generation/orchestration/evaluation.service.ts` | Edit | Add `composeJudgeSystemMessage()`; delete `includes('OUTPUT FORMAT')` check and fallback format |
| `apps/api/src/image-generation/orchestration/orchestration.service.ts` | Edit | Add `canJudge` runtime guard with empty-list fail-fast |
| `apps/api/migrations/TIMESTAMP-AddJudgePromptAndMigrateData.ts` | **New** | Add column + extract OUTPUT FORMAT from existing systemPrompts |
| `apps/api/src/agent/agent.controller.ts` | Edit | Handle `judgePrompt` null-clearing in update payload |
| `apps/web/.../judge-detail/judge-detail.page.html` | Edit | Add Judging tab (value "4"); remove evaluationCategories from Prompts tab; remove weights from Weights & RAG tab |
| `apps/web/.../judge-detail/judge-detail.page.ts` | Edit | Add `judgePrompt` to form; wire up Judging tab logic |
| `apps/web/src/app/shared/models/agent.model.ts` | Edit | Add `judgePrompt?: string \| null` to frontend model |

## References

- Evaluation service: `apps/api/src/image-generation/orchestration/evaluation.service.ts`
- Agent entity: `apps/api/src/agent/agent.entity.ts`
- Agent edit page: `apps/web/src/app/pages/organization-admin/judges/judge-detail/judge-detail.page.html`
- Default optimizer prompt pattern: `apps/api/src/image-generation/entities/prompt-optimizer.entity.ts`
- ShopX judge prompt (specialized example): `apps/api/src/image-generation/prompts/cce-shopx-judge.md`
- Ford ABM parity plan: `docs/plans/2026-02-07-feat-agent-enhancements-ford-abm-parity-plan.md`
