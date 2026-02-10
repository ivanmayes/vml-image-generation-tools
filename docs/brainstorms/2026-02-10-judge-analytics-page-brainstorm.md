---
date: 2026-02-10
topic: judge-analytics-page
---

# Judge Analytics Page

## What We're Building

An analytics tab on the agent detail page that gives deep insight into how a judge performs across generation requests. The goal is to surface which checklist criteria are useful (discriminating) vs. useless (always pass or always fail), show scoring patterns, and provide tools to improve the judge prompt based on real data.

## Key Decisions

- **Single judge, many requests**: Analytics scoped to one judge across all requests it participated in. No cross-judge comparison needed.
- **On-the-fly computation**: Query and aggregate at page load — no precomputed analytics tables. Default limit of 50 most recent requests, adjustable (25/50/100).
- **Quantitative vs. qualitative split**: Pass rates, scores, severity counts are always visible. Freeform text analysis (feedback patterns, issue themes) is behind an on-demand "Analyze" button that calls an LLM.
- **Tables, not charts**: All data presented as tables with written explanations. No charting library dependency.
- **Outlier auto-surfacing**: Checklist items with < 10% or > 90% pass rate flagged automatically as poor judge criteria.
- **Tab placement**: New tab within `my-agent-detail` page, alongside existing agent config.

## Page Layout

### Tab: "Analytics"

#### Top — Overview Bar

| Field             | Source                                       |
| ----------------- | -------------------------------------------- |
| Requests analyzed | Count of generation requests with this judge |
| Date range        | Earliest to latest request in the dataset    |
| Avg overall score | Mean of all `overallScore` values            |
| Limit selector    | Dropdown: 25 / 50 / 100 most recent          |

#### Section 1 — Checklist Pass Rates (Quantitative)

Table with columns:

- **Criteria** — checklist item key
- **Pass Rate** — percentage (with colored bar fill)
- **Times Evaluated** — count of evaluations that included this item
- **Flag** — auto-flagged if < 10% (never passes) or > 90% (always passes)

Sorted by pass rate ascending so problem criteria are at top. Flagged rows get a visual callout (colored badge: "Never Passes" / "Always Passes").

Written explanation above the table:

> "Criteria that almost never pass may indicate the judge is asking for something AI image generation cannot reliably achieve. Criteria that almost always pass may not be adding value — they don't discriminate between good and bad outputs."

#### Section 2 — Category Score Averages (Quantitative)

Table with columns:

- **Category** — category name from `categoryScores`
- **Avg Score** — mean across all evaluations
- **Min / Max** — range
- **Std Dev** — consistency measure

Written explanation:

> "Categories with high averages and low deviation are strengths the judge consistently recognizes. Categories with low averages may represent persistent weaknesses in generation, or overly strict criteria."

#### Section 3 — Score Distribution (Quantitative)

Table showing score buckets:

- 0-29, 30-49, 50-69, 70-79, 80-89, 90-100
- Count and percentage in each bucket

Written explanation:

> "A judge that clusters most scores in one range may not be calibrated well. A good judge produces a spread across ranges as image quality varies."

#### Section 4 — Top Issue Severity Breakdown (Quantitative)

Table with columns:

- **Severity** — critical / major / moderate / minor
- **Count** — times this severity was assigned
- **Percentage** — of total issues

Written explanation:

> "A judge that almost always flags 'critical' issues may be too harsh, while one that mostly flags 'minor' may not be pushing hard enough for improvement."

#### Section 5 — Qualitative Analysis (Auto-loaded)

Loads automatically when the analytics tab opens (alongside quantitative data). No separate button needed.

The API collects all freeform text from the evaluated requests:

- All `topIssues[].problem` and `topIssues[].fix` text
- All `whatWorked` entries
- All `feedback` text
- All checklist `note` fields

LLM analyzes and returns:

- **Recurring issue themes** — what problems come up repeatedly
- **Blind spots** — what the judge never mentions
- **Feedback quality** — are fixes actionable or vague
- **Strengths recognized** — what does the judge consistently praise

Results displayed as a written summary in a card. May load slightly after the quantitative tables (streaming or async).

#### Sticky Footer — Actions

Button: **"Optimize Judge Prompt"**

Flow:

1. User clicks "Optimize Judge Prompt"
2. API receives: current judge prompt + aggregated analytics (pass rates, score distributions, issue themes, flagged criteria)
3. LLM generates a revised prompt that:
   - Removes or rewords criteria that never pass (unrealistic for AI)
   - Removes or rewords criteria that always pass (not discriminating)
   - Sharpens scoring rubric based on actual score distribution
   - Adds criteria for blind spots identified in qualitative analysis
4. UI shows a side-by-side or diff view: current prompt vs. suggested prompt
5. User reviews and clicks "Apply" or "Discard"
6. If applied, updates the agent's `judgePrompt` field

## Data Access Pattern

### API Endpoint

`GET /organization/:orgId/agents/:agentId/analytics?limit=50`

### Query Logic (Pseudocode)

```
1. Find generation requests WHERE judgeIds @> [agentId]
   ORDER BY createdAt DESC
   LIMIT :limit

2. For each request, unnest iterations[].evaluations[]
   WHERE evaluation.agentId = :agentId

3. Aggregate:
   - Checklist: count passes/total per key
   - Category scores: avg/min/max/stddev per key
   - Overall scores: bucket into ranges
   - Top issues: count by severity
   - Collect raw text for qualitative endpoint
```

### Qualitative Analysis Endpoint

`POST /organization/:orgId/agents/:agentId/analytics/analyze`

Body: `{ limit: 50 }` (re-fetches data server-side to avoid sending huge payloads)

Returns: structured LLM analysis summary.

### Prompt Optimization Endpoint

`POST /organization/:orgId/agents/:agentId/analytics/optimize-prompt`

Body: `{ limit: 50 }` (uses analytics data + current prompt)

Returns: `{ currentPrompt: string, suggestedPrompt: string, changes: string[] }`

## Resolved Questions

- **Analyze vs. Optimize dependency**: Analyze runs automatically on tab load. Optimize is a separate user-initiated button. Independent but the user sees the full analysis before deciding to optimize.
- **Prompt version history**: Not needed now. Optimize overwrites the current `judgePrompt` field directly.

## Next Steps

> `/workflows:plan` for implementation details
