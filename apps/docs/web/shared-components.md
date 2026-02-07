# Shared Components

The web application includes several reusable shared components that are used across multiple pages. These live in `apps/web/src/app/shared/`.

## Image Evaluator Component

**Source:** `apps/web/src/app/shared/components/image-evaluator/`

A standalone image evaluation widget that can be embedded on any page. It allows users to evaluate images outside of the generation pipeline — useful for quick quality checks or ad-hoc evaluations.

### How It Works

1. **Select judges** — Choose one or more judge agents from the organization
2. **Provide images** — Via URL, file upload, or browsing existing images
3. **Evaluate** — Sends a `POST /evaluate` request to the API
4. **View results** — Scores, feedback, and category breakdowns

### Sub-Components

- **ImageEvaluatorComponent** — The main wrapper that orchestrates the evaluation flow
- **EvaluationResultsComponent** — Displays evaluation results with:
  - Overall score (color-coded by severity)
  - Category score breakdown (if the judge uses evaluation categories)
  - TOP_ISSUE display with severity badge
  - What worked list
  - Detailed feedback text
- **ImagePickerDialogComponent** — Browse and select from previously generated images

## Header & Navigation

**Source:** `apps/web/src/app/shared/components/`

### HeaderComponent

The global header bar, containing:

- **NavigationBarComponent** — Main navigation links (Home, Generation, Compliance, Projects)
- **AccountBarComponent** — User avatar, display name, and logout button

### SidebarComponent

Collapsible sidebar navigation for the application. Managed by `SidebarService` for state persistence.

## Confirm Dialog

**Source:** `apps/web/src/app/shared/components/confirm-dialog/`

Generic confirmation modal used before destructive actions (delete agent, cancel request). Displays a message and OK/Cancel buttons.

## Select Dialog

Multi-select dialog component for choosing items from a list. Used in the judge selection flow and other places where the user needs to pick multiple items.

## Toolbox Grid Component

**Source:** `apps/web/src/app/shared/components/toolbox-grid/`

Displays available tools as a grid of cards on the home page. Each card shows:

- Tool icon
- Tool name
- Brief description
- Link to the tool's page

The tools are registered in the **Tool Registry** (see [Tool Registry](../tools/overview.md)).

## Directives

### DropFileDirective

Adds drag-and-drop file handling to any element. Emits events when files are dragged over or dropped. Used in the compliance tool for bulk image upload.

### FillHeightDirective

Automatically adjusts an element's height to fill the remaining viewport space. Used for full-height page layouts.

## Pipes

| Pipe                  | Purpose                                        | Example                                 |
| --------------------- | ---------------------------------------------- | --------------------------------------- |
| `EntityFieldMaskPipe` | Masks sensitive data in display                | `user@email.com` → `u***@email.com`     |
| `JoinWithPropPipe`    | Joins array of objects by a property           | `[{name: 'A'}, {name: 'B'}]` → `'A, B'` |
| `PluckFromArrayPipe`  | Extracts a property from array items           | Useful in templates                     |
| `SafeHtmlPipe`        | Wraps `DomSanitizer.bypassSecurityTrustHtml()` | For trusted HTML content                |
| `SafeUrlPipe`         | Wraps `DomSanitizer.bypassSecurityTrustUrl()`  | For trusted URLs                        |
| `ShortNumberPipe`     | Formats large numbers                          | `1234` → `1.2K`                         |

## Utilities

**Source:** `apps/web/src/app/shared/utils/`

### Score Utilities (`score.utils.ts`)

Score severity classification used across the application:

```typescript
const SCORE_THRESHOLDS = {
  critical: 40,
  major: 60,
  moderate: 75,
  minor: 90,
};
```

Functions:

- `getScoreSeverity(score)` — Returns 'critical', 'major', 'moderate', 'minor', or 'good'
- `getScoreColor(score)` — Returns a CSS color for the severity level
- `getScoreLabel(score)` — Returns a human-readable label

### Other Utilities

The `shared/utils/` directory contains various helper functions:

- **Array utilities** — Deduplication, grouping, sorting
- **Object utilities** — Deep merge, pick, omit
- **String utilities** — Truncation, formatting
- **Time/Date utilities** — Formatting, relative time
- **DOM utilities** — Scroll, focus management
- **Cache utilities** — In-memory caching helpers
- **Input mask utility** — Input formatting

## Guards

### AdminRoleGuard

Route guard that restricts access to Admin and SuperAdmin users. Used on the organization admin routes.

### SpaceAdminGuard

Route guard that restricts access to space administrators. Used on space admin routes.

## Models

The `shared/models/` directory contains TypeScript interfaces that mirror the API response types:

- **GenerationRequestModel** — Request status enums, iteration snapshots, evaluation results
- **AgentModel** — Agent configuration, evaluation result interfaces
- **ProjectModel** — Project definition
- **ComplianceImageModel** — Image compliance tracking
- **SpaceModel** — Space types and role enums
- **UserRoleEnum** — User role definitions
- **OrganizationSettingsModel** — Organization configuration

These models are kept in sync with the backend entity `toPublic()` and `toDetailed()` response shapes.
