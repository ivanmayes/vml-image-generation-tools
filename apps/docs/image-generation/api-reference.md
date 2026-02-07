# API Reference

Complete endpoint documentation for the image generation system. All production endpoints require JWT authentication and organization access.

**Base URL:** `http://localhost:8002` (configurable via `API_PORT` env var)

## Generation Requests

Base path: `/organization/:orgId/image-generation/requests`

### List Requests

```
GET /organization/:orgId/image-generation/requests
```

**Query Parameters:**

| Param       | Type   | Default | Description                                                                                 |
| ----------- | ------ | ------- | ------------------------------------------------------------------------------------------- |
| `status`    | enum   | —       | Filter by status: pending, optimizing, generating, evaluating, completed, failed, cancelled |
| `projectId` | UUID   | —       | Filter by project                                                                           |
| `spaceId`   | UUID   | —       | Filter by space                                                                             |
| `limit`     | number | 50      | Results per page (max 100)                                                                  |
| `offset`    | number | 0       | Pagination offset                                                                           |

**Response:** Array of request summaries with `finalImageUrl` and `bestScore` fields appended.

### Get Request Detail

```
GET /organization/:orgId/image-generation/requests/:id
```

Returns the full request including all iteration snapshots, parameters, and error messages.

### Create Request

```
POST /organization/:orgId/image-generation/requests
```

**Body:**

```json
{
  "brief": "A Coca-Cola bottle on a marble countertop with dramatic side lighting",
  "judgeIds": ["uuid-1", "uuid-2"],
  "projectId": "uuid-project",
  "spaceId": "uuid-space",
  "initialPrompt": "Optional custom initial prompt (skips first optimization)",
  "referenceImageUrls": ["https://example.com/reference.jpg"],
  "negativePrompts": "AVOID: distorted text on labels",
  "generationMode": "mixed",
  "threshold": 85,
  "maxIterations": 10,
  "imageParams": {
    "imagesPerGeneration": 3,
    "aspectRatio": "16:9",
    "quality": "2K"
  }
}
```

**Required fields:** `brief`, `judgeIds`

**Response:** The created request (status: pending). The request is automatically queued for processing.

### Cancel Request

```
DELETE /organization/:orgId/image-generation/requests/:id
```

Cancels a pending or in-progress request. Only works for requests with status: pending, optimizing, generating, or evaluating.

### Trigger Request

```
POST /organization/:orgId/image-generation/requests/:id/trigger
```

Manually triggers processing for a pending request. Used if the initial queue submission failed.

### Continue Request

```
POST /organization/:orgId/image-generation/requests/:id/continue
```

Resumes a completed or failed request with additional iterations.

**Body:**

```json
{
  "additionalIterations": 5,
  "judgeIds": ["uuid-1", "uuid-2"],
  "promptOverride": "Optional new prompt to use",
  "generationMode": "edit"
}
```

All fields are optional. If `judgeIds` is provided, it replaces the existing judge list.

### Get Request Images

```
GET /organization/:orgId/image-generation/requests/:id/images
```

Returns all generated images for a request across all iterations.

### Stream Request Events (SSE)

```
GET /organization/:orgId/image-generation/requests/:id/stream?token={jwt}
```

Server-Sent Events endpoint for real-time progress updates. Authentication is via the `token` query parameter (required because EventSource can't send headers).

See [Events & Streaming](events-and-streaming.md) for event type details.

### List Organization Images

```
GET /organization/:orgId/image-generation/requests/images
```

Lists all generated images across all requests for the organization.

**Query Parameters:**

| Param    | Type   | Default | Description                |
| -------- | ------ | ------- | -------------------------- |
| `limit`  | number | 50      | Results per page (max 100) |
| `offset` | number | 0       | Pagination offset          |

### Upload Compliance Image

```
POST /organization/:orgId/image-generation/requests/images/upload
```

Uploads an image for compliance evaluation (not linked to a generation request). Accepts JPEG, PNG, and WebP files via multipart form data.

**Response:** `{ url: "https://s3-bucket-url/..." }`

## Judge Agents

Base path: `/organization/:orgId/agents`

### List Agents

```
GET /organization/:orgId/agents
```

**Query Parameters:**

| Param    | Type   | Description               |
| -------- | ------ | ------------------------- |
| `query`  | string | Search by name            |
| `sortBy` | string | Sort field                |
| `order`  | string | Sort direction (ASC/DESC) |

### Get Agent

```
GET /organization/:orgId/agents/:id
```

Returns agent details including the document list.

### Create Agent

```
POST /organization/:orgId/agents
```

**Body:**

```json
{
  "name": "Brand Compliance Judge",
  "systemPrompt": "You are an expert brand compliance evaluator...",
  "evaluationCategories": "brandAccuracy, logoPlacement, colorFidelity",
  "scoringWeight": 80,
  "optimizationWeight": 50,
  "ragConfig": {
    "topK": 5,
    "similarityThreshold": 0.7
  },
  "templateId": "brand-compliance"
}
```

**Required fields:** `name`, `systemPrompt`

### Update Agent

```
PUT /organization/:orgId/agents/:id
```

Accepts partial updates. RAG config is merged with existing values.

### Delete Agent

```
DELETE /organization/:orgId/agents/:id
```

Soft-deletes the agent (sets `deletedAt`). The agent's data is preserved but it won't appear in listings.

### List Agent Documents

```
GET /organization/:orgId/agents/:id/documents
```

### Upload Document

```
POST /organization/:orgId/agents/:id/documents
```

Multipart form upload. Accepts PDF and DOCX files. Processing (chunking + embedding) happens asynchronously.

### Delete Document

```
DELETE /organization/:orgId/agents/:id/documents/:documentId
```

Removes the document from both S3 and the database.

## Image Evaluation

### Evaluate Images

```
POST /organization/:orgId/image-generation/evaluate
```

Ad-hoc evaluation endpoint — evaluate existing images with selected judges without running the full generation pipeline.

**Body:**

```json
{
  "brief": "A Coca-Cola bottle on marble...",
  "imageUrls": ["https://s3-bucket/image1.jpg", "https://s3-bucket/image2.jpg"],
  "judgeIds": ["uuid-1", "uuid-2"]
}
```

Returns evaluation results for each image from each judge.

## Projects

Base path: `/organization/:orgId/projects`

### List Projects

```
GET /organization/:orgId/projects
```

### Get Project

```
GET /organization/:orgId/projects/:id
```

### Create Project

```
POST /organization/:orgId/projects
```

**Body:**

```json
{
  "name": "Q4 Campaign",
  "description": "Holiday season product photography",
  "spaceId": "uuid-space",
  "settings": {}
}
```

### Update Project

```
PUT /organization/:orgId/projects/:id
```

### Delete Project

```
DELETE /organization/:orgId/projects/:id
```

## Prompt Optimizer

### Get Optimizer Config

```
GET /organization/:orgId/image-generation/prompt-optimizer
```

### Update Optimizer Config

```
PUT /organization/:orgId/image-generation/prompt-optimizer
```

**Body:**

```json
{
  "systemPrompt": "You are an expert prompt optimizer...",
  "config": {
    "model": "gemini-2.0-flash",
    "temperature": 0.7,
    "maxTokens": 4096
  }
}
```

## Debug Endpoints

These endpoints are only available in development mode (`NODE_ENV !== 'production'`) and require no authentication.

### Test Request

```
POST /debug/image-generation/test-request
```

Creates a test generation request with pre-configured test agents. Useful for development and testing the full pipeline.

## Response Envelope

All endpoints return responses in the standard envelope format:

```json
{
  "status": "success",
  "message": "Optional message",
  "data": {}
}
```

Error responses:

```json
{
  "status": "failure",
  "message": "Error description"
}
```

## Authentication

All production endpoints require:

1. **JWT Bearer Token** — In the `Authorization` header: `Bearer {token}`
2. **Organization Access** — The authenticated user must belong to the organization in the URL path
3. **Role** — Admin or SuperAdmin role required

The SSE streaming endpoint uses a `token` query parameter instead of the Authorization header.

## HTTP Status Codes

| Code | Meaning                                                  |
| ---- | -------------------------------------------------------- |
| 200  | Success                                                  |
| 201  | Created (POST requests)                                  |
| 400  | Bad request (validation error, invalid state transition) |
| 401  | Unauthorized (missing or invalid token)                  |
| 403  | Forbidden (wrong organization or insufficient role)      |
| 404  | Not found                                                |
| 500  | Internal server error                                    |
