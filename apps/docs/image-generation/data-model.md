# Data Model

The image generation system uses several TypeORM entities to persist requests, images, agents, documents, and projects. All entities use UUID primary keys, belong to an organization (multi-tenant isolation), and follow the platform's standard patterns.

## Entity Relationship Diagram

```
Organization (1)
    │
    ├── (N) Agent
    │       ├── (N) AgentDocument
    │       └── ragConfig, systemPrompt, weights
    │
    ├── (N) Project
    │       └── (N) GenerationRequest
    │
    ├── (N) GenerationRequest
    │       ├── judgeIds[]
    │       ├── iterations[] (JSONB snapshots)
    │       ├── costs (JSONB)
    │       ├── imageParams (JSONB)
    │       └── (N) GeneratedImage
    │
    └── (1) PromptOptimizer
            └── systemPrompt, config
```

## GenerationRequest

The central entity representing one image generation job.

**Table:** `image_generation_requests`

**Source:** `apps/api/src/image-generation/entities/generation-request.entity.ts`

### Columns

| Column               | Type        | Default                    | Description                             |
| -------------------- | ----------- | -------------------------- | --------------------------------------- |
| `id`                 | UUID        | auto                       | Primary key                             |
| `organizationId`     | UUID        | required                   | FK to Organization (CASCADE delete)     |
| `projectId`          | UUID        | null                       | FK to Project (SET NULL on delete)      |
| `spaceId`            | UUID        | null                       | FK to Space (SET NULL on delete)        |
| `brief`              | text        | required                   | User's plain-language image description |
| `initialPrompt`      | text        | null                       | Custom prompt for first iteration       |
| `referenceImageUrls` | JSONB       | null                       | Array of reference image URLs           |
| `negativePrompts`    | text        | null                       | Accumulated things to avoid             |
| `judgeIds`           | UUID[]      | required                   | Array of judge agent IDs                |
| `imageParams`        | JSONB       | `{imagesPerGeneration: 3}` | Generation parameters                   |
| `threshold`          | int         | 75                         | Target score (0-100)                    |
| `maxIterations`      | int         | 5                          | Maximum iteration count                 |
| `generationMode`     | enum        | `regeneration`             | Strategy: regeneration, edit, mixed     |
| `status`             | enum        | `pending`                  | Current status                          |
| `currentIteration`   | int         | 0                          | Current/completed iteration number      |
| `finalImageId`       | UUID        | null                       | ID of the selected best image           |
| `completionReason`   | enum        | null                       | Why the request stopped                 |
| `iterations`         | JSONB       | `[]`                       | Array of IterationSnapshot              |
| `costs`              | JSONB       | `{llmTokens:0,...}`        | Cost tracking                           |
| `errorMessage`       | text        | null                       | Error details (if failed)               |
| `createdAt`          | timestamptz | auto                       | Creation timestamp                      |
| `completedAt`        | timestamptz | null                       | Completion timestamp                    |

### Status Enum

```
pending → optimizing → generating → evaluating → completed
                                                → failed
                                                → cancelled
```

| Status       | Meaning                           |
| ------------ | --------------------------------- |
| `pending`    | Created, waiting to be processed  |
| `optimizing` | Prompt optimization in progress   |
| `generating` | Image generation in progress      |
| `evaluating` | Judge evaluation in progress      |
| `completed`  | Finished (check completionReason) |
| `failed`     | Failed with error                 |
| `cancelled`  | Cancelled by user                 |

### Completion Reasons

| Reason                | Meaning                                                      |
| --------------------- | ------------------------------------------------------------ |
| `SUCCESS`             | Met the threshold score                                      |
| `MAX_RETRIES_REACHED` | Exhausted all iterations without meeting threshold           |
| `DIMINISHING_RETURNS` | Score plateaued (minimal improvement over recent iterations) |
| `CANCELLED`           | User cancelled the request                                   |
| `ERROR`               | Failed with an error                                         |

### Indexes

- `organizationId` — Fast lookup by tenant
- `status` — Fast filtering by status
- `(organizationId, status)` — Compound index for filtered listings
- `(organizationId, projectId)` — Fast project-based queries

### JSONB Structures

#### ImageParams

```typescript
interface ImageParams {
  aspectRatio?: string; // "16:9", "1:1", "4:3"
  quality?: string; // "1K", "2K", "4K"
  imagesPerGeneration: number; // default: 3
  plateauWindowSize?: number; // default: 3
  plateauThreshold?: number; // default: 0.02
}
```

#### IterationSnapshot

```typescript
interface IterationSnapshot {
  iterationNumber: number;
  optimizedPrompt: string;
  selectedImageId?: string;
  aggregateScore: number;
  evaluations: AgentEvaluationSnapshot[];
  createdAt: Date;
  mode?: "regeneration" | "edit";
  editSourceImageId?: string;
  consecutiveEditCount?: number;
}
```

#### AgentEvaluationSnapshot

```typescript
interface AgentEvaluationSnapshot {
  agentId: string;
  agentName: string;
  imageId: string;
  overallScore: number;
  categoryScores?: Record<string, number>;
  feedback: string;
  weight: number;
  topIssue?: TopIssueSnapshot;
  whatWorked?: string[];
  checklist?: Record<string, { passed: boolean; note?: string }>;
  promptInstructions?: string[];
}
```

#### RequestCosts

```typescript
interface RequestCosts {
  llmTokens: number;
  imageGenerations: number;
  embeddingTokens: number;
  totalEstimatedCost: number;
}
```

### Entity Methods

- `getBestScore()` — Returns the highest aggregate score across all iterations
- `isScorePlateauing(windowSize, threshold)` — Checks if recent scores show minimal variance
- `toPublic()` — Returns a safe public representation
- `toDetailed()` — Returns the full representation including iterations, params, and judge IDs

## GeneratedImage

Individual images produced by the generation pipeline.

**Table:** `image_generation_images`

| Column             | Type        | Description                            |
| ------------------ | ----------- | -------------------------------------- |
| `id`               | UUID        | Primary key                            |
| `requestId`        | UUID        | FK to GenerationRequest                |
| `iterationNumber`  | int         | Which iteration produced this image    |
| `s3Url`            | text        | Full S3 URL for the image              |
| `s3Key`            | text        | S3 object key                          |
| `promptUsed`       | text        | The prompt used to generate this image |
| `generationParams` | JSONB       | Aspect ratio, quality, etc.            |
| `mimeType`         | string      | Usually `image/jpeg`                   |
| `fileSizeBytes`    | int         | File size in bytes                     |
| `createdAt`        | timestamptz | Creation timestamp                     |

## Agent

Judge agents that evaluate generated images.

**Table:** `image_generation_agents`

| Column                 | Type        | Description                      |
| ---------------------- | ----------- | -------------------------------- |
| `id`                   | UUID        | Primary key                      |
| `organizationId`       | UUID        | FK to Organization               |
| `name`                 | string      | Agent display name               |
| `systemPrompt`         | text        | Evaluation behavior instructions |
| `evaluationCategories` | text        | Category definitions for scoring |
| `scoringWeight`        | int (0–100) | Influence on aggregate score     |
| `optimizationWeight`   | int (0–100) | Influence on prompt optimization |
| `ragConfig`            | JSONB       | `{ topK, similarityThreshold }`  |
| `templateId`           | string      | Pre-built template reference     |
| `deletedAt`            | timestamptz | Soft-delete marker               |
| `createdAt`            | timestamptz | Creation timestamp               |

## AgentDocument

Documents uploaded to agents for RAG context.

**Table:** `image_generation_agent_documents`

| Column      | Type        | Description                               |
| ----------- | ----------- | ----------------------------------------- |
| `id`        | UUID        | Primary key                               |
| `agentId`   | UUID        | FK to Agent                               |
| `filename`  | string      | Original filename                         |
| `mimeType`  | string      | File MIME type                            |
| `s3Key`     | string      | S3 storage path                           |
| `metadata`  | JSONB       | Processing status, file size, chunk count |
| `createdAt` | timestamptz | Upload timestamp                          |

## Project

Groups generation requests together.

**Table:** `projects`

| Column           | Type        | Description            |
| ---------------- | ----------- | ---------------------- |
| `id`             | UUID        | Primary key            |
| `organizationId` | UUID        | FK to Organization     |
| `spaceId`        | UUID        | FK to Space (optional) |
| `name`           | string      | Project name           |
| `description`    | text        | Project description    |
| `settings`       | JSONB       | Flexible configuration |
| `createdAt`      | timestamptz | Creation timestamp     |

## PromptOptimizer

Singleton configuration for the prompt optimization service.

**Table:** `image_generation_prompt_optimizer`

| Column         | Type        | Description                         |
| -------------- | ----------- | ----------------------------------- |
| `id`           | UUID        | Primary key                         |
| `systemPrompt` | text        | LLM system prompt for optimization  |
| `config`       | JSONB       | `{ model, temperature, maxTokens }` |
| `createdAt`    | timestamptz | Creation timestamp                  |

## Important: TypeORM Column Defaults

Never use long strings with apostrophes or quotes as `@Column({ default: ... })` values. TypeORM generates `ALTER COLUMN SET DEFAULT '...'` SQL, and unescaped quotes in the default value will break schema sync.

**Fix:** Set defaults in application code (service layer) rather than database defaults. The `DEFAULT_OPTIMIZER_PROMPT` constant is stored in code and applied in the `PromptOptimizerService.getOrCreateOptimizer()` method for this reason.
