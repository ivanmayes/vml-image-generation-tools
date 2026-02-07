---
title: "Bulk Image Compliance: 8-Agent Review Fixes"
date: 2026-02-07
category: code-quality
module: apps/web/compliance
tags:
  - angular
  - signals
  - primeng
  - compliance
  - code-review
  - race-conditions
  - security
  - performance
symptoms:
  - Subscription leak on rapid image add/remove
  - Blob URL memory leak on component destroy
  - Modal shows stale data after image removal
  - Unbounded file uploads crash browser tab
  - Queue processes images without judges selected
  - Keyboard navigation fails in evaluation detail modal
root_cause: >
  Initial implementation of bulk image compliance tool had 23 issues
  across security, performance, race conditions, architecture, and
  code quality dimensions. Discovered via 8 parallel review agents
  (security, performance, architecture, frontend-races, pattern-recognition,
  code-simplicity, agent-native, TypeScript quality).
related_docs:
  - docs/plans/plan-2026-02-06-0002.md
  - docs/solutions/feature-implementation/bulk-image-compliance-tool.md
---

# Bulk Image Compliance: 8-Agent Review Fixes

## Context

After implementing the Bulk Image Compliance tool (6 phases), a manual review found 5 bugs. Then 8 specialized review agents ran in parallel, producing a prioritized report of 23 issues: 5 critical (P1), 9 important (P2), and 9 nice-to-have (P3).

All 23 issues were fixed and build-verified.

## Priority 1 (Critical) -- Fixed

### 1. Subscription Leak on Image Removal

**Problem:** When removing an image mid-evaluation, the HTTP subscription continued running. The response handler would try to update a removed image, wasting resources.

**Fix:** Track active subscriptions in a `Map<string, Subscription>`. Cancel on removal.

```typescript
// compliance.page.ts
private readonly activeSubscriptions = new Map<string, Subscription>();

onRemoveImage(imageId: string): void {
  const sub = this.activeSubscriptions.get(imageId);
  if (sub) {
    sub.unsubscribe();
    this.activeSubscriptions.delete(imageId);
  }
  this.images.update((prev) => prev.filter((i) => i.id !== imageId));
  this.processQueue(); // refill freed slot
}
```

### 2. Blob URL Memory Leak

**Problem:** `URL.createObjectURL()` was called for file previews but never revoked, leaking memory across the browser session.

**Fix:** Track blob URLs in a `Set<string>`. Revoke individually on upload success/failure and bulk-revoke on component destroy.

```typescript
private readonly blobUrls = new Set<string>();

constructor() {
  this.destroyRef.onDestroy(() => {
    for (const url of this.blobUrls) {
      URL.revokeObjectURL(url);
    }
    this.blobUrls.clear();
  });
}

private revokeBlobUrl(url: string): void {
  if (this.blobUrls.has(url)) {
    URL.revokeObjectURL(url);
    this.blobUrls.delete(url);
  }
}
```

### 3. Queue Runs Without Judges Selected

**Problem:** Images added before selecting judges would enter `queued` state and sit indefinitely. Selecting judges later didn't trigger queue processing for already-queued items.

**Fix:** Add an `effect()` that watches `selectedJudgeIds` and schedules queue processing when judges change. Use microtask coalescing to prevent redundant calls.

```typescript
constructor() {
  effect(() => {
    const judgeIds = this.selectedJudgeIds();
    if (judgeIds.length > 0) {
      this.scheduleProcessQueue();
    }
  });
}

private scheduleProcessQueue(): void {
  if (this.queueScheduled) return;
  this.queueScheduled = true;
  queueMicrotask(() => {
    this.queueScheduled = false;
    this.processQueue();
  });
}
```

### 4. Status Transition Pollution

**Problem:** Using spread operator (`{ ...img, status: 'queued' }`) carried stale properties from previous states (e.g., `aggregateScore` from a `complete` image being retried).

**Fix:** Construct clean objects with only the properties valid for the target state.

```typescript
// Instead of: { ...img, status: 'queued' as const }
// Use explicit construction:
{
  id: img.id,
  url: img.url,
  fileName: img.fileName,
  addedAt: img.addedAt,
  status: 'queued' as const,
}
```

### 5. Discriminated Union Type Not Shared

**Problem:** `ComplianceImage` type was defined inline in `compliance.page.ts`. Child components imported from the parent page, creating a circular dependency risk.

**Fix:** Extract to `shared/models/compliance-image.model.ts`.

```typescript
// compliance-image.model.ts
interface ComplianceImageBase {
  id: string;
  url: string;
  fileName?: string;
  addedAt: number;
}

export type ComplianceImage =
  | (ComplianceImageBase & { status: "uploading" })
  | (ComplianceImageBase & { status: "queued" })
  | (ComplianceImageBase & { status: "evaluating" })
  | (ComplianceImageBase & {
      status: "complete";
      aggregateScore: number;
      evaluations: EvaluationResult[];
    })
  | (ComplianceImageBase & { status: "failed"; error: string });
```

## Priority 2 (Important) -- Fixed

### 6. URL Input Validation

Added `URL` constructor validation and protocol allowlist (http/https only) for the "Add URL" dialog.

### 7. Image Count Cap

Added `MAX_IMAGES = 50` limit with toast notification when exceeded.

### 8. File Type Validation

Added allowlist check (`image/jpeg`, `image/png`, `image/webp`) in `onFilesDropped()`.

### 9. File Size Limit

Added `MAX_FILE_SIZE = 20MB` check with toast notification for oversized files.

### 10. Score Utility Extraction

Extracted `getScoreSeverity()`, `getScoreLabel()`, and `SCORE_THRESHOLDS` to `shared/utils/score.utils.ts` to eliminate duplication across components.

### 11. Aggregate Score Computation in Summary

Added `summary()` computed signal with pass/warn/fail/error counts and average score.

### 12. Retry Failed Images

Added `onRetryImage()` method that resets a failed image to `queued` status and triggers queue processing.

### 13. Error Message Display

Failed image cards now show the error message and a retry button.

### 14. Navigation Between Completed Images

Detail modal has Previous/Next buttons with keyboard arrow key support, navigating only among completed images.

## Priority 3 (Nice-to-Have) -- Fixed

### 15. NgModule Wrapper Removed

Deleted `compliance.module.ts`. Changed all routes from `loadChildren` to `loadComponent` for standalone component lazy loading.

### 16. Derived `hasImages` State

Replaced `hasImages = input(false)` in `ImageGridComponent` with `readonly hasImages = computed(() => this.images().length > 0)`.

### 17. Template `@let` Optimization

Added `@let s = summary()` in `compliance.page.html` to reduce 12 redundant signal reads to 1.

### 18. Animation Delay Cap

Capped stagger animation delay at 0.48s (index 16) to prevent 1.5s delays when 50 images are loaded.

### 19. Auto-Close Stale Modal

Added effect to auto-close detail modal when the selected image is removed while the modal is open.

### 20. Auto-Focus Keyboard Navigation

Added `AfterViewChecked` + `viewChild` pattern to auto-focus the detail layout div when the modal opens, enabling immediate keyboard navigation.

## Prevention Checklist

For future Angular signal-based features with queue processing:

- [ ] Track all subscriptions; cancel on item removal
- [ ] Track and revoke all blob URLs on destroy
- [ ] Construct clean state objects on transitions (no stale spread)
- [ ] Validate all external input (URLs, file types, file sizes)
- [ ] Cap collection sizes with user-facing limits
- [ ] Extract shared types to `shared/models/`
- [ ] Extract shared utilities to `shared/utils/`
- [ ] Use `computed()` for derived state, not redundant inputs
- [ ] Use `@let` to reduce template signal reads
- [ ] Auto-focus interactive elements on modal/dialog open
- [ ] Guard queue processing against missing prerequisites (e.g., no judges)
- [ ] Use microtask coalescing for effect-triggered queue processing

## Files Changed

| File                                                                 | Action   |
| -------------------------------------------------------------------- | -------- |
| `shared/models/compliance-image.model.ts`                            | Created  |
| `shared/utils/score.utils.ts`                                        | Created  |
| `pages/compliance/compliance.page.ts`                                | Modified |
| `pages/compliance/compliance.page.html`                              | Modified |
| `pages/compliance/compliance.module.ts`                              | Deleted  |
| `pages/compliance/components/image-grid.component.ts`                | Modified |
| `pages/compliance/components/image-card.component.ts`                | Modified |
| `pages/compliance/components/image-card.component.html`              | Modified |
| `pages/compliance/components/evaluation-detail-modal.component.ts`   | Modified |
| `pages/compliance/components/evaluation-detail-modal.component.html` | Modified |
| `pages/compliance/components/bulk-compliance-header.component.ts`    | Modified |
| `app-routing.module.ts`                                              | Modified |
| `app.routes.ts`                                                      | Modified |
| `pages/projects/projects.module.ts`                                  | Modified |
