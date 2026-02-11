---
title: "Parent-Child Component Form Sync Data Loss"
date: "2026-02-11"
category: "logic-errors"
severity: "high"
tags:
  [
    "angular-19",
    "signals",
    "reactive-forms",
    "parent-child-communication",
    "data-consistency",
    "output-events",
  ]
components: ["apps/web/src/app/pages/my-agents/my-agent-detail"]
symptoms:
  [
    "stale form values after child API call",
    "silent data overwrite on parent save",
    "form state desynchronization",
  ]
root_cause: "Child component made direct API updates to entity fields without propagating changes back to parent's reactive form, causing parent to retain stale values and overwrite optimized data on subsequent saves"
solution: "Add output<string>() event emitter to child component that fires after successful API updates; parent template binds event to reactive form setValue()"
pattern: "Output Event Synchronization"
---

# Parent-Child Component Form Sync Data Loss

## Problem Description

In the `MyAgentDetailPage` component, when a child component (`JudgeAnalyticsComponent`) updates the backend by calling `agentService.updateAgent()` with a new `judgePrompt`, the parent page's reactive form retains the OLD `judgePrompt` value. When the user subsequently clicks the parent's "Save" button, the `save()` method serializes ALL form values (including the stale `judgePrompt`) and sends a PUT request, silently overwriting the child component's update with the old value.

**Error behavior:**

1. User clicks "Apply Optimized Prompt" button in child component
2. Child executes: `agentService.updateAgent(..., { judgePrompt: newValue })` -- succeeds
3. Success toast appears: "Prompt Updated"
4. Parent's form still holds: `form.get('judgePrompt')?.value === oldValue`
5. User clicks parent's "Save" button
6. PUT request sent with old `judgePrompt`, overwriting the optimization
7. Data persisted to backend is the old value, not the optimized prompt

## Root Cause Analysis

This is a **reactive form data synchronization issue** caused by the component hierarchy not sharing form state:

1. **Parent holds form authority**: `MyAgentDetailPage` has a `FormGroup` with a `judgePrompt` FormControl, populated once during `loadAgent()` on page init.
2. **Child updates backend directly**: `JudgeAnalyticsComponent.applyOptimizedPrompt()` calls `agentService.updateAgent()` directly, bypassing the parent's form entirely.
3. **No parent form notification**: After the API call succeeds, the child has no mechanism to tell the parent form to update its `judgePrompt` control.
4. **Save overwrites the update**: Parent's `save()` calls `getRawValue()` on the form group, which still contains the value from initial page load, not the backend's new value.

The form value and backend state diverge silently. The next form save is treated as an authoritative "update all fields" operation, causing data loss.

## Solution

Add an `output<string>()` signal to the child component that emits the new value after a successful API save. The parent template binds this event to update its form control.

### Child component (`judge-analytics.component.ts`)

```typescript
import {
  // ... existing imports
  output, // <-- add this
} from "@angular/core";

export class JudgeAnalyticsComponent implements OnInit {
  agent = input.required<Agent>();
  promptApplied = output<string>(); // <-- add output signal

  applyOptimizedPrompt(): void {
    const result = this.optimizationResult();
    if (!result) return;

    this.agentService
      .updateAgent(this.organizationId, this.agent().id, {
        judgePrompt: result.suggestedPrompt,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: "success",
            summary: "Prompt Updated",
            detail: "Judge prompt has been optimized and saved.",
            life: 3000,
          });
          this.promptApplied.emit(result.suggestedPrompt); // <-- emit
          this.optimizationResult.set(null);
        },
        // ... error handler
      });
  }
}
```

### Parent template (`my-agent-detail.page.html`)

```html
<app-judge-analytics
  [agent]="agent()!"
  (promptApplied)="form.get('judgePrompt')?.setValue($event)"
></app-judge-analytics>
```

When the child emits the new prompt string, the parent's form control updates immediately. Subsequent parent saves will serialize the correct value.

## Investigation Steps

1. **Identified discrepancy**: During code review, noticed `applyOptimizedPrompt()` calls `agentService.updateAgent()` directly without any parent notification mechanism.
2. **Traced form binding**: Found parent `FormGroup` at line 109-148 with `judgePrompt: new FormControl<string | null>(null)`, initially populated via `patchValue()` in `loadAgent()`.
3. **Checked parent save**: Confirmed `save()` serializes ALL form values via `getRawValue()` and sends them in a PUT request, including the stale `judgePrompt`.
4. **Verified no existing sync**: The child's `<app-judge-analytics>` tag had `[agent]` input but no event bindings to propagate changes back.

## When This Pattern Occurs

- **Nested edit panels**: Parent shows main form, child has a separate "Save" button that calls API independently
- **Side panel operations**: Parent has main form, child in drawer/modal makes autonomous API calls
- **Multi-step forms**: Parent manages overall form state, intermediate steps make incremental API saves
- **Feature-specific child actions**: Child has specialized functionality (like "Optimize Prompt") that updates a field the parent also manages

### Warning Signs

- Child component injects an API service AND the parent has a FormGroup for the same entity
- Child has `input()` for entity data but no `output()` events back to parent
- Both parent and child have buttons that trigger API mutations on the same entity
- No shared state service between parent and child for this entity

## Prevention Strategies

### Architectural Guidelines

1. **Single source of truth**: Entity state should live in ONE location (parent FormGroup, shared service, or store). Never let child components silently mutate the same entity.
2. **Form state is authoritative**: When a parent owns a reactive FormGroup, child components must not bypass it with direct API calls without notifying the parent.
3. **Formalize data flow**: Document which component "owns" each piece of form state and establish explicit contracts for mutations.

### Code Review Checklist

- [ ] Does any child component call `apiService.update()`/`.patch()`/`.post()` on entity fields that the parent's FormGroup also manages?
- [ ] If child modifies parent's entity, does it emit an output event or use a shared service to notify the parent?
- [ ] Are there multiple "Save" buttons on the page that could cause competing writes?
- [ ] After child's API call, is the parent's form state still consistent with the backend?

### Alternative Approaches

| Approach                       | Best For                  | Tradeoff                                                  |
| ------------------------------ | ------------------------- | --------------------------------------------------------- |
| `output()` event (used here)   | Simple parent-child pairs | Explicit, minimal; doesn't scale to deep nesting          |
| Shared state service           | Complex component trees   | Single source of truth; more setup required               |
| Parent controls all API calls  | Strict form ownership     | Child emits "commands", parent executes; more boilerplate |
| Reload entity after child save | Quick fix                 | Extra API call; form may flash/reset                      |

## Related Documentation

- Feature plan: `docs/plans/2026-02-10-feat-judge-analytics-tab-plan.md`
- Agent detail page: `apps/web/src/app/pages/my-agents/my-agent-detail/my-agent-detail.page.ts`
- Analytics component: `apps/web/src/app/pages/my-agents/my-agent-detail/components/judge-analytics/judge-analytics.component.ts`

## Files Changed

- `apps/web/.../judge-analytics/judge-analytics.component.ts`: Added `output` import, `promptApplied` output signal, emit call after successful save
- `apps/web/.../my-agent-detail/my-agent-detail.page.html`: Added `(promptApplied)` binding on `<app-judge-analytics>`
