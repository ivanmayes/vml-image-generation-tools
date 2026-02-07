---
title: "Bulk Image Compliance Tool - Feature Implementation"
date: 2026-02-07
category: feature-implementation
module: apps/web/compliance
tags:
  - angular
  - angular-signals
  - primeng
  - standalone-components
  - discriminated-union
  - concurrent-queue
  - image-evaluation
  - compliance
  - drag-drop
  - onpush
description: >
  Bulk image compliance scanning tool with concurrent evaluation queue,
  judge-based scoring, drag-drop upload, and real-time status tracking
  using Angular signals and PrimeNG components.
related_docs:
  - docs/plans/2026-02-06-feat-bulk-image-compliance-mode-plan.md
  - docs/solutions/code-quality/bulk-image-compliance-8-agent-review-fixes.md
---

# Bulk Image Compliance Tool

A standalone Angular page that lets users drop/upload/browse images, select AI judges, and run concurrent compliance evaluations with real-time status tracking.

## Component Architecture

```
ComplianceToolPage (container, state owner)
  |- BulkComplianceHeaderComponent
  |    |- p-multiselect (judge picker, chip display)
  |    |- p-textarea (brief / evaluation instructions)
  |
  |- Summary strip (inline, pass/warn/fail/error counts + avg score)
  |
  |- ImageGridComponent (drop zone + card grid)
  |    |- DropFileDirective (HTML5 drag-drop)
  |    |- ImageCardComponent[] (per-image status cards)
  |         |- Status badge (uploading/queued/evaluating/failed)
  |         |- Score footer (on complete)
  |         |- Remove button
  |         |- Retry button (on failed)
  |
  |- p-dialog (URL input)
  |- ImagePickerDialogComponent (browse generated images)
  |- EvaluationDetailModalComponent (full evaluation report)
       |- EvaluationResultsComponent (shared, per-judge)
            |- Score + severity tag
            |- Top issue card
            |- Category score progress bars
            |- What worked list
            |- Checklist (pass/fail items)
            |- Feedback text
```

**Data flow is strictly unidirectional:** parent signals flow down via `input()`, child events bubble up via `output()`. The container page owns all state.

## State Model

### Discriminated Union Type

The core data model is a discriminated union that makes invalid states unrepresentable:

```typescript
// shared/models/compliance-image.model.ts
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

Properties like `aggregateScore` only exist on `complete` images. TypeScript narrows automatically after status checks.

### Signal Architecture

```
Primary Signals (writable)
  images: signal<ComplianceImage[]>
  selectedJudgeIds: signal<string[]>
  brief: signal<string>
  judges: signal<Agent[]>
  loadingJudges: signal<boolean>
  showUrlDialog / showBrowseDialog / showDetailModal / selectedImageId

Computed Signals (derived, cached)
  hasImages        = images.length > 0
  isEvaluating     = any image has status 'evaluating'
  completedImages  = filter status === 'complete'
  summary          = { total, passed, warned, failed, errors, avgScore }
  selectedImage    = find by selectedImageId
  hasPrevImage     = selectedImageIndex > 0
  hasNextImage     = selectedImageIndex < completedImages.length - 1

Effects (side-effect triggers)
  selectedJudgeIds changes -> scheduleProcessQueue()
  selectedImage disappears while modal open -> close modal
```

## Status Lifecycle

```
File upload:    uploading -> queued -> evaluating -> complete
                                 \                \-> failed
URL / Browse:           queued -> evaluating -> complete
                                          \-> failed
Retry:          failed -> queued -> evaluating -> complete
                                          \-> failed
```

All transitions construct **clean objects** with only the properties valid for the target state -- no spread operator that would carry stale fields.

## Queue & Concurrency

The queue processor runs up to 3 evaluations concurrently:

```
processQueue()
  1. Count images with status === 'evaluating' (active)
  2. available = MAX_CONCURRENT(3) - active
  3. Guard: available <= 0 or no judges selected -> return
  4. Take next `available` images with status === 'queued'
  5. Batch-update them to 'evaluating' (single signal write)
  6. Fire parallel API calls via evaluateImage()
  7. On each complete/error -> update status, call processQueue() again
```

**Microtask coalescing** prevents redundant queue runs:

```typescript
private scheduleProcessQueue(): void {
  if (this.queueScheduled) return;
  this.queueScheduled = true;
  queueMicrotask(() => {
    this.queueScheduled = false;
    this.processQueue();
  });
}
```

**Subscription tracking** enables cancellation when images are removed mid-evaluation:

```typescript
private readonly activeSubscriptions = new Map<string, Subscription>();
```

## API Integration

Three endpoints power the feature:

| Endpoint                                                        | Method | Purpose               |
| --------------------------------------------------------------- | ------ | --------------------- |
| `/organization/{orgId}/agents`                                  | GET    | Load available judges |
| `/organization/{orgId}/image-generation/requests/images/upload` | POST   | Upload file to S3     |
| `/organization/{orgId}/image-generation/evaluate`               | POST   | Run judge evaluation  |

The evaluate endpoint accepts `{ brief, imageUrls[], judgeIds[] }` and returns `{ winner: { aggregateScore, evaluations[] } }`.

## Image Sources

Three ways to add images:

1. **Drag & drop / file picker** -- Files uploaded to S3 first, then queued
2. **URL input** -- Validated (http/https only), queued directly
3. **Browse generated** -- Pick from previous generation results via `ImagePickerDialogComponent`

## Validation & Limits

| Constraint             | Value           |
| ---------------------- | --------------- |
| Max images             | 50              |
| Max file size          | 20 MB           |
| Accepted types         | JPEG, PNG, WebP |
| URL schemes            | http, https     |
| Concurrent evaluations | 3               |

## Key Angular Patterns

### Standalone Components with OnPush

All components are standalone (no NgModule) with `ChangeDetectionStrategy.OnPush`. Signals handle change notification automatically.

```typescript
@Component({
  selector: 'app-compliance-tool',
  templateUrl: './compliance.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, PrimeNgModule, ...childComponents],
})
```

### Signal Inputs and Outputs

Child components use the modern `input()` / `output()` functions:

```typescript
// image-card.component.ts
image = input.required<ComplianceImage>();
index = input(0);
select = output<string>();
remove = output<string>();
retry = output<string>();
```

### Lazy Loading

Route uses `loadComponent` for standalone component lazy loading:

```typescript
{
  path: 'compliance',
  loadComponent: () =>
    import('./pages/compliance/compliance.page').then(
      (m) => m.ComplianceToolPage,
    ),
}
```

### Template Control Flow

Uses Angular 17+ `@if` / `@for` / `@switch` / `@let` syntax:

```html
@let s = summary(); @if (s.passed > 0) {
<span class="compliance-summary__stat">{{ s.passed }} passed</span>
} @for (image of images(); track image.id) {
<app-image-card [image]="image" [index]="$index" />
}
```

### Resource Cleanup

- Blob URLs tracked in `Set<string>`, revoked on destroy
- Active HTTP subscriptions tracked in `Map<string, Subscription>`, cancelled on image removal
- `takeUntilDestroyed(this.destroyRef)` on all subscriptions

## PrimeNG Components Used

| Component       | Usage                                    |
| --------------- | ---------------------------------------- |
| `p-multiselect` | Judge selection with chip display        |
| `p-dialog`      | URL input modal, evaluation detail modal |
| `p-accordion`   | Multi-judge evaluation results           |
| `p-tag`         | Score severity badges                    |
| `p-button`      | Actions throughout                       |
| `p-toast`       | Notifications (errors, warnings, limits) |
| `p-skeleton`    | Loading state for judge list             |
| `p-progressbar` | Category scores in evaluation results    |

## Shared Utilities

### Score Utils (`shared/utils/score.utils.ts`)

```typescript
export const SCORE_THRESHOLDS = { PASS: 80, WARN: 60 } as const;

export function getScoreSeverity(score: number): "success" | "warn" | "danger";
export function getScoreLabel(score: number): string;
```

### Shared Components

- **`EvaluationResultsComponent`** -- Renders a single judge's evaluation (score, top issue, categories, checklist, feedback). Reused in judge detail page.
- **`ImagePickerDialogComponent`** -- Browse previously generated images. Loads from `GenerationRequestService`.
- **`DropFileDirective`** -- HTML5 drag-drop with `dragOver` visual feedback.

## Detail Modal

The evaluation detail modal shows:

- Image preview
- Aggregate score with severity tag
- Top issue (from first judge that reports one)
- Per-judge accordion (or single view for 1 judge)
- Previous/Next navigation (keyboard arrows + buttons)
- Auto-focus on open for immediate keyboard nav

## Files Created

| File                                                                | Purpose                            |
| ------------------------------------------------------------------- | ---------------------------------- |
| `pages/compliance/compliance.page.ts`                               | Container: state, queue, API calls |
| `pages/compliance/compliance.page.html`                             | Container template                 |
| `pages/compliance/compliance.page.scss`                             | Page-level styles                  |
| `pages/compliance/components/bulk-compliance-header.component.*`    | Judge picker + brief               |
| `pages/compliance/components/image-grid.component.*`                | Drop zone + card grid              |
| `pages/compliance/components/image-card.component.*`                | Individual image card              |
| `pages/compliance/components/image-card.component.scss`             | Card styles + animations           |
| `pages/compliance/components/evaluation-detail-modal.component.*`   | Full report modal                  |
| `shared/models/compliance-image.model.ts`                           | Discriminated union type           |
| `shared/utils/score.utils.ts`                                       | Score severity helpers             |
| `shared/components/image-evaluator/evaluation-results.component.*`  | Reusable eval display              |
| `shared/components/image-evaluator/image-picker-dialog.component.*` | Browse images dialog               |
