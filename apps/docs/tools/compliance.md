# Compliance Tool

The compliance tool allows users to evaluate existing images against brand guidelines or quality standards in bulk, without running the full generation pipeline. It's useful for checking marketing assets, validating deliverables, or auditing image libraries against specific criteria.

## How It Works

Unlike the iterative image generation tool (which generates and evaluates), the compliance tool only evaluates. You provide images, select judges, and get evaluation results.

```
Upload images → Select judges → Evaluate in parallel → View results
```

## Features

- **Bulk evaluation** — Upload up to 50 images at once
- **Drag-and-drop** — Drop files directly onto the page
- **Concurrent processing** — Up to 3 images evaluated simultaneously
- **Per-image results** — Each image gets independent evaluation from all selected judges
- **Score-based filtering** — Filter results by severity (critical, major, moderate, minor)
- **File size limit** — 20 MB per image

## Page Structure

**Route:** `/compliance`

**Source:** `apps/web/src/app/pages/compliance/`

```
compliance/
├── compliance.page.ts          # Main page component
├── compliance.page.html        # Page template
├── compliance.page.scss        # Page styles
└── components/
    ├── bulk-compliance-header/  # Judge picker + file uploader
    ├── image-grid/              # Grid of images with status
    ├── image-card/              # Single image with evaluation
    └── evaluation-detail-modal/ # Full evaluation details popup
```

### Components

#### BulkComplianceHeaderComponent

The top section of the page containing:

- **Judge selector** — Multi-select dropdown of available judge agents
- **File uploader** — Drag-and-drop zone for images (JPEG, PNG, WebP)
- **Start evaluation** button

#### ImageGridComponent

A responsive grid displaying all uploaded images with their evaluation status:

- **Pending** — Gray overlay, waiting for evaluation
- **Evaluating** — Loading spinner
- **Completed** — Score badge with severity coloring
- **Failed** — Error indicator

#### ImageCardComponent

Individual image card showing:

- Image thumbnail
- Score badge (color-coded by severity)
- Judge name who evaluated
- Click to open full evaluation details

#### EvaluationDetailModalComponent

A modal that shows the complete evaluation for a specific image:

- Overall score and severity
- Category score breakdown
- TOP_ISSUE with severity badge
- What worked list
- Full feedback text
- Checklist (if the judge uses one)

## Evaluation Flow

1. **Upload** — User uploads images (stored temporarily or uploaded to S3 via the compliance image upload endpoint)
2. **Judge Selection** — User selects one or more judge agents
3. **Concurrent Evaluation** — The page evaluates images using the `POST /evaluate` endpoint with a concurrency limit of 3
4. **Results Display** — Each image card updates as its evaluation completes
5. **Filtering** — User can filter by severity to focus on problematic images

## Score Severity Thresholds

The compliance tool uses the shared score utility thresholds:

| Score Range | Severity | Color       | Meaning                        |
| ----------- | -------- | ----------- | ------------------------------ |
| 0–39        | Critical | Red         | Major issues, fails compliance |
| 40–59       | Major    | Orange      | Significant issues             |
| 60–74       | Moderate | Yellow      | Some issues to address         |
| 75–89       | Minor    | Light green | Mostly compliant, minor fixes  |
| 90–100      | Good     | Green       | Passes compliance              |

## API Endpoint Used

The compliance tool uses the ad-hoc evaluation endpoint:

```
POST /organization/:orgId/image-generation/evaluate
```

```json
{
  "brief": "Evaluate this image against brand guidelines",
  "imageUrls": ["https://s3-bucket/uploaded-image.jpg"],
  "judgeIds": ["uuid-1", "uuid-2"]
}
```

For image uploads, it uses:

```
POST /organization/:orgId/image-generation/requests/images/upload
```

This uploads the file to S3 and returns a URL that can be used for evaluation.

## Concurrent Processing

To avoid overwhelming the API, the compliance page manages a concurrency queue:

- Maximum 3 evaluations running simultaneously
- Additional images wait in a queue
- Progress indicator shows total/completed/pending counts
- Uses RxJS subscription management for proper cleanup

## Use Cases

- **Brand compliance audits** — Check a batch of marketing assets against brand guidelines
- **Quality assurance** — Evaluate generated images before publishing
- **A/B comparison** — Evaluate multiple versions of the same concept
- **Deliverable validation** — Check agency deliverables against specifications
