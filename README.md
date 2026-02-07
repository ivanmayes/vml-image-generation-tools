# VML Image Generation Tools

A production-ready, enterprise-grade AI image generation platform featuring iterative refinement, multi-judge evaluation, and intelligent prompt optimization. Built on NestJS, Angular, and PostgreSQL with multi-tenant architecture and pluggable AI providers.

| Project Meta     |                                                                        |
| ---------------- | ---------------------------------------------------------------------- |
| Built With       | NestJS ^11.x, Angular ^19.x, PrimeNG ^20.x, PostgreSQL, Tailwind 4     |
| Architecture     | Multi-tenant, Organization-scoped, Modular                             |
| Image Generation | Google Gemini (`gemini-3-pro-image-preview`) with iterative refinement |
| AI Providers     | OpenAI, Anthropic, Google Gemini, Azure, AWS Bedrock                   |
| Evaluation       | Multi-judge weighted scoring with RAG-augmented context                |
| Authentication   | Basic (Code), OAuth/OIDC (Okta), SAML 2.0, WPP Open SSO                |

## Table of Contents

- [Introduction](#introduction)
- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [Image Generation Pipeline](#image-generation-pipeline)
- [Multi-Judge Evaluation System](#multi-judge-evaluation-system)
- [Prompt Optimization Engine](#prompt-optimization-engine)
- [Generation Modes & Strategy Selection](#generation-modes--strategy-selection)
- [RAG Document System](#rag-document-system)
- [Image Compliance Tool](#image-compliance-tool)
- [Project Management](#project-management)
- [Real-Time Streaming](#real-time-streaming)
- [Algorithms & Design Principles](#algorithms--design-principles)
- [Web Application](#web-application)
- [AI Framework](#ai-framework)
- [Authentication System](#authentication-system)
- [Multi-Tenant Architecture](#multi-tenant-architecture)
- [Notification System](#notification-system)
- [Theming & Design System](#theming--design-system)
- [Third-Party Integrations](#third-party-integrations)
- [Console Commands](#console-commands)
- [API Documentation](#api-documentation)
- [Security Features](#security-features)
- [Deployment](#deployment)

---

## Introduction

VML Image Generation Tools is an AI-powered platform for generating, evaluating, and iteratively refining images to meet specific quality standards. At its core is a closed-loop pipeline: generate images with Google Gemini, evaluate them with configurable AI judge agents, optimize the prompt based on structured feedback, and repeat until the result meets a target quality threshold.

The platform solves a hard problem in AI image generation: **single-shot generation rarely produces production-quality results.** Labels get distorted, proportions drift, brand colors shift, and compositions miss the mark. By automating the critique-and-refine cycle that a human creative director would perform manually, the system systematically improves output quality across iterations.

Key problems the platform addresses:

- **Iterative Refinement**: Automated generate-evaluate-optimize loop that converges toward quality targets
- **Structured Evaluation**: Multi-judge scoring with weighted aggregation, category breakdowns, and actionable feedback
- **Intelligent Prompt Optimization**: LLM-based prompt rewriting that incorporates judge feedback verbatim
- **Adaptive Strategy Selection**: Automatic switching between full regeneration and targeted image editing based on score trajectory
- **RAG-Augmented Judging**: Upload brand guidelines, spec sheets, or reference documents that judges use as evaluation context
- **Image Compliance**: Batch evaluation of existing images against judge panels for quality assurance
- **Organization Isolation**: All data and resources are scoped to organizations by default
- **Flexible Authentication**: Support for multiple authentication strategies per organization
- **Unified AI Integration**: Single interface for 5+ LLM providers with automatic failover

The architecture follows proven patterns from production systems, with careful attention to security, scalability, and developer experience.

---

## Key Features

### Image Generation & Evaluation

- **Iterative Refinement Pipeline**: Closed-loop generate → evaluate → optimize → regenerate cycle with configurable iteration limits and quality thresholds
- **Multi-Judge Evaluation**: Multiple AI judge agents evaluate each image in parallel, each with independent scoring weights and domain-specific system prompts
- **Weighted Score Aggregation**: Judges contribute to final scores proportionally via configurable scoring weights, producing a single aggregate quality metric
- **Structured Feedback Format**: Judges return machine-parseable JSON with scores, TOP_ISSUE (single most critical fix with severity), category breakdowns, checklists, and verbatim prompt instructions
- **Prompt Optimization Engine**: LLM-based prompt rewriting that incorporates judge feedback, preserves what worked, and addresses critical issues first — producing 500-1000+ word structured prompts
- **Three Generation Modes**: Full regeneration (new images each iteration), targeted editing (refine previous best), or mixed mode (adaptive strategy selection based on score trajectory and issue severity)
- **RAG-Augmented Evaluation**: Upload PDFs, DOCX, or TXT reference documents to judges — documents are chunked, embedded, and retrieved via cosine similarity during evaluation
- **Negative Prompt Accumulation**: Problems identified by judges accumulate across iterations as an avoid-list, preventing the same issues from recurring
- **Plateau Detection**: Statistical detection of diminishing returns triggers early termination when scores stop improving
- **Image Compliance Tool**: Batch evaluation of existing images against judge panels with concurrent queue processing, summary statistics, and pass/warn/fail categorization
- **Cost Tracking**: Per-request cost accumulation across LLM tokens, image generations, and embedding operations
- **Real-Time SSE Streaming**: Server-Sent Events push status changes, iteration results, and completion events to the frontend in real time
- **Request Continuation**: Resume completed or failed requests with additional iterations, modified prompts, or different generation modes
- **Project Organization**: Group generation requests under named projects with shared context

### Core Platform

- **Multi-Tenant by Design**: Organization → Space → User hierarchy with complete isolation
- **Role-Based Access Control**: Hierarchical roles (SuperAdmin, Admin, Manager, User, Guest)
- **Fine-Grained Permissions**: Entity-level permission system with custom permission types
- **API Key Management**: Encrypted keys with usage tracking and revocation

### AI & Machine Learning

- **Multi-Provider AI Framework**: Unified interface for OpenAI, Anthropic, Google, Azure, AWS Bedrock
- **Modality Support**: Text, Image, Vision, Audio, Embeddings, Function Calling
- **Cost Tracking**: Automatic cost estimation per request with configurable alerts
- **Streaming Support**: Real-time streaming responses for all supported providers

### Authentication

- **Multiple Strategies**: Basic (code-based), Okta (OAuth2/OIDC), SAML 2.0
- **Per-Organization Config**: Each organization can use different auth strategies
- **WPP Open SSO**: Native integration with WPP Open workspace authentication
- **Token Management**: JWT-based with automatic cleanup and revocation

### Developer Experience

- **Swagger/OpenAPI**: Auto-generated API documentation with live testing
- **Console Commands**: CLI tools for setup, user management, and code scaffolding
- **Hot Reload**: Both API and Web support instant code reloading
- **Type Safety**: Shared DTOs between API and Web via TypeScript path aliases

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        VML Image Generation Tools                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐      │
│  │   Angular 19     │    │    NestJS 11     │    │  PostgreSQL   │      │
│  │   + PrimeNG 20   │◄──►│    REST API      │◄──►│   Database    │      │
│  │   + Tailwind 4   │    │    + TypeORM     │    │               │      │
│  └────────┬─────────┘    └────────┬─────────┘    └───────────────┘      │
│           │                       │                                      │
│    ┌──────┴──────┐    ┌───────────┼───────────────────┐                  │
│    │             │    │           │                   │                  │
│    ▼             ▼    ▼           ▼                   ▼                  │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐ ┌──────────┐│
│  │  Theme   │ │  SSE     │ │   Image   │ │  AI          │ │  Third-  ││
│  │  System  │ │  Events  │ │   Gen     │ │  Framework   │ │  Party   ││
│  │  Dark/   │ │  Real-   │ │  Pipeline │ │  5 Providers │ │  AWS S3  ││
│  │  Light   │ │  time    │ │  + Judges │ │  6 Modalities│ │  SES..   ││
│  └──────────┘ └──────────┘ └───────────┘ └──────────────┘ └──────────┘│
│                                │                                        │
│               ┌────────────────┼────────────────┐                       │
│               │                │                │                       │
│               ▼                ▼                ▼                       │
│        ┌────────────┐  ┌────────────┐  ┌──────────────┐                │
│        │  Gemini    │  │  Prompt    │  │  RAG         │                │
│        │  Image API │  │  Optimizer │  │  Documents   │                │
│        │  Gen/Edit  │  │  LLM-based │  │  Embed/Search│                │
│        └────────────┘  └────────────┘  └──────────────┘                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Organization-Scoped by Default**: Every resource belongs to an organization. This ensures complete data isolation between tenants without complex query logic.

2. **Strategy Pattern for Extensibility**: Authentication, notifications, AI providers, and generation modes all use the strategy pattern, allowing new implementations without modifying existing code.

3. **Shared Type System**: DTOs defined in the API are imported directly by the web app via TypeScript path aliases (`@api/*`), ensuring type safety across the stack.

4. **Progressive Enhancement**: Features like AI integration, SSO, and advanced notifications are optional. The core platform works without them.

5. **Environment-Driven Configuration**: All third-party integrations configure themselves from environment variables with sensible defaults.

6. **Closed-Loop Refinement**: The image generation pipeline embodies a feedback-driven design — each iteration's output becomes the next iteration's input context, enabling systematic convergence toward quality targets.

7. **Resilient Parallel Execution**: Image generation, evaluation, and upload operations use `Promise.allSettled()` to run in parallel without a single failure blocking the batch. Retry logic with exponential backoff (1s → 2s → 4s) handles transient API failures.

8. **JSONB Consolidation**: Iteration history, evaluation snapshots, and document chunks are stored as JSONB arrays within their parent entities, reducing table count while maintaining full queryability.

---

## Getting Started

### Prerequisites

- Node.js 24+ (use nvm: `nvm install 24 && nvm use 24`)
- PostgreSQL 14+
- npm 10+

### Quick Start

```bash
# Clone and install
git clone <repository-url>
cd vml-open-boilerplate
npm install

# Create databases
createdb your_api_database_name

# Configure environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Edit .env files with your database URL and settings

# Start development servers (hot reload enabled)
npm start

# URLs:
# - API: http://localhost:8001
# - Web: http://localhost:4200
# - Swagger: http://localhost:8001/api (when SWAGGER_ENABLE=true)
```

### Initial Setup

After starting the API, run the organization installer:

```bash
cd apps/api && npm run console:dev InstallOrganization
```

This interactive command:

1. Creates your first organization
2. Sets up an authentication strategy (Basic, Okta, or SAML)
3. Creates an admin user
4. Generates necessary configuration

### Environment Configuration

#### API (`apps/api/.env`)

```bash
# Core
LOCALHOST=true
DEBUG=true
SWAGGER_ENABLE=true
ORIGINS=localhost

# Database
DATABASE_URL=postgres://postgres:@localhost:5432/your_api_database_name
DATABASE_SYNCHRONIZE=true  # Set to false in production

# AI Providers (all optional)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=...
AZURE_OPENAI_API_KEY=...
AWS_BEDROCK_REGION=us-east-1

# AI Defaults
AI_DEFAULT_TEXT_PROVIDER=openai  # openai, anthropic, google, azure, bedrock
AI_LOGGING_ENABLED=true
AI_COST_TRACKING_ENABLED=true

# AWS Services
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SES_REGION=us-east-1

# Signing Keys (generate unique keys for production)
PII_SIGNING_KEY=<base64-key>
PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

#### Web (`apps/web/.env`)

```bash
LOCALHOST=true
PRODUCTION=false
API_SETTINGS={"localhost":[{"name":"Local","endpoint":"http://localhost:8001","organizationId":"YOUR-ORG-ID","production":false,"locale":"en-US"}]}
```

---

## Image Generation Pipeline

The image generation pipeline is the central feature of the platform. It orchestrates a multi-iteration refinement loop that generates images, evaluates them with AI judges, optimizes the prompt based on structured feedback, and repeats until quality targets are met.

### How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Orchestration Service                            │
│                                                                      │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│   │ Prompt   │───▶│ Gemini   │───▶│ Judge    │───▶│ Check        │  │
│   │ Optimize │    │ Generate │    │ Evaluate │    │ Termination  │  │
│   └──────────┘    └──────────┘    └──────────┘    └──────┬───────┘  │
│        ▲                                                  │          │
│        │            ◄── Iteration Loop ──►                │          │
│        └──────────────────────────────────────────────────┘          │
│                                                                      │
│   Events: STATUS_CHANGE → ITERATION_COMPLETE → COMPLETED/FAILED     │
└──────────────────────────────────────────────────────────────────────┘
```

Each iteration follows a precise sequence:

1. **Prompt Optimization** — The optimizer takes the original brief, previous judge feedback, RAG context, and negative prompts, then generates a detailed 500-1000+ word structured prompt organized into five required sections.

2. **Image Generation** — Google Gemini's `gemini-3-pro-image-preview` model generates N images (configurable, 1-4) in parallel from the optimized prompt. Reference images can be included as style guidance.

3. **Multi-Judge Evaluation** — Each generated image is evaluated by all selected judge agents in parallel. Judges return structured JSON with scores, TOP_ISSUE, category breakdowns, checklists, and feedback.

4. **Aggregation & Selection** — Scores are aggregated using weighted averages across judges. The best-scoring image is selected as the iteration winner.

5. **Termination Check** — The system checks whether to stop (threshold met, plateau detected, max iterations reached, timeout, cancellation) or continue iterating.

### Termination Conditions

| Condition         | Trigger                                               | Completion Reason     |
| ----------------- | ----------------------------------------------------- | --------------------- |
| Threshold Met     | Best image score ≥ target threshold                   | `SUCCESS`             |
| Plateau Detected  | Score variance in last N iterations < 2% of max score | `DIMINISHING_RETURNS` |
| Max Iterations    | All configured iterations exhausted                   | `MAX_RETRIES_REACHED` |
| Timeout           | Total orchestration exceeds 10 minutes                | Early completion      |
| User Cancellation | User explicitly cancels via API                       | `CANCELLED`           |

### Request Lifecycle

A generation request transitions through these statuses:

```
PENDING → OPTIMIZING → GENERATING → EVALUATING → (loop) → COMPLETED
                                                          → FAILED
                                                          → CANCELLED
```

### Image Generation via Gemini

The `GeminiImageService` wraps Google's `@google/genai` SDK for both image generation and image editing:

- **Generation**: Creates new images from text prompts using `gemini-3-pro-image-preview` with `responseModalities: ['TEXT', 'IMAGE']`
- **Editing**: Takes a base64-encoded source image and an edit instruction, producing targeted modifications while preserving the image foundation
- **Reference Images**: Optional reference images are fetched, converted to base64, and included in the generation request to guide style and composition
- **Aspect Ratio**: Configurable aspect ratios (1:1, 4:3, 3:4, 16:9, 9:16)
- **Mock Mode**: Set `IMAGE_GEN_MOCK=true` to return placeholder images for development without consuming API credits

### Cost Tracking

Each request accumulates costs across three dimensions:

| Cost Type          | Incremented When                            |
| ------------------ | ------------------------------------------- |
| `imageGenerations` | After each image batch generation           |
| `llmTokens`        | After each evaluation and optimization call |
| `embeddingTokens`  | After RAG document chunk searches           |

Total estimated cost is calculated from token and image counts using provider pricing.

### Request Continuation

Completed or failed requests can be resumed with additional iterations. The continuation API accepts:

- **Prompt override**: Modify the prompt for the next round
- **Generation mode change**: Switch between regeneration, edit, or mixed
- **Additional iterations**: Specify how many more iterations to run

This allows human-in-the-loop refinement where a user reviews results, adjusts the prompt, and lets the system continue optimizing.

### Module Structure

```
apps/api/src/image-generation/
├── agent/                    # Judge agent CRUD and document management
├── debug.controller.ts       # Dev-only test endpoints (no auth required)
├── document-processor/       # RAG document parsing, chunking, embeddings
├── entities/                 # TypeORM entities, enums, interfaces
├── generation-request/       # Request CRUD, SSE streaming, continuation
├── image-generation.module.ts
├── jobs/                     # Async job queue for orchestration
├── orchestration/            # Core pipeline: orchestration, generation, evaluation
└── prompt-optimizer/         # LLM-based prompt refinement
```

---

## Multi-Judge Evaluation System

The evaluation system uses multiple independent AI judge agents to score generated images. Each judge has its own system prompt, evaluation criteria, and scoring weight, enabling nuanced multi-dimensional evaluation.

### Judge Agent Configuration

Each judge agent is configured with:

| Field                  | Purpose                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `name`                 | Display name (e.g., "Brand Compliance Judge")                             |
| `systemPrompt`         | Full instructions defining evaluation criteria and output format          |
| `evaluationCategories` | Optional comma-separated categories to score (e.g., "Brand, Composition") |
| `scoringWeight`        | Influence on final aggregate score (0-100)                                |
| `optimizationWeight`   | Influence on prompt optimization prioritization (0-100)                   |
| `ragConfig`            | RAG retrieval settings: `topK` (1-20) and `similarityThreshold` (0-1)     |
| `documents`            | Uploaded reference documents for RAG-augmented evaluation                 |

### Structured Evaluation Output

Judges return machine-parseable JSON with these fields:

```json
{
  "score": 75,
  "TOP_ISSUE": {
    "problem": "Bottle label text is distorted and unreadable",
    "severity": "critical",
    "fix": "Ensure the label text reads 'RESERVE 18' in gold serif font"
  },
  "categoryScores": {
    "brandAccuracy": 60,
    "composition": 85
  },
  "whatWorked": [
    "Lighting is dramatic and professional",
    "Background texture is realistic"
  ],
  "promptInstructions": [
    "Add rim lighting at 5600K color temperature",
    "Label must read RESERVE 18"
  ],
  "checklist": {
    "labelAccuracy": { "passed": false, "note": "Text is distorted" },
    "colorFidelity": { "passed": true, "note": "Brand red matches spec" }
  },
  "feedback": "The image captures the mood well but label accuracy needs improvement..."
}
```

Each field serves a specific role in the pipeline:

- **`score`**: Numeric quality rating (0-100) used for aggregation and threshold comparison
- **`TOP_ISSUE`**: The single most important fix, with severity level (critical/major/moderate/minor) — used by the strategy selector and edit instruction builder
- **`categoryScores`**: Multi-dimensional breakdown enabling judges to evaluate different aspects independently
- **`whatWorked`**: Positive aspects the optimizer must preserve in the next iteration's prompt
- **`promptInstructions`**: Exact text snippets the optimizer incorporates verbatim into the next prompt
- **`checklist`**: Binary pass/fail items for systematic quality tracking across iterations
- **`feedback`**: Free-form evaluation narrative for human review

### Weighted Score Aggregation

The aggregate score for each image is computed as a weighted average across all judges:

```
aggregateScore = Σ(judge_score_i × scoring_weight_i) / Σ(scoring_weight_i)
```

This allows different judges to have proportional influence on the final score. For example, a brand compliance judge with weight 60 has more influence than a composition judge with weight 40.

### Iteration Context

Judges receive context about previous iterations to calibrate scoring:

```
This is iteration 3 of 10. Previous scores: [62, 68, 70].
Score the image on its absolute merits. If this iteration genuinely improved
on previous issues, the score SHOULD increase. If the same problems persist,
the score should NOT increase.
```

This prevents artificial score inflation in later iterations — a common failure mode in iterative evaluation systems.

### Custom Output Format Detection

If a judge's system prompt contains the text `"OUTPUT FORMAT"`, the evaluation service skips adding its default format instructions. This allows judges to define entirely custom response structures while still participating in the pipeline.

---

## Prompt Optimization Engine

The prompt optimizer transforms judge feedback into improved generation prompts. Rather than simple text concatenation, it uses an LLM to synthesize feedback into coherent, detailed prompts that address identified issues while preserving what worked.

### How It Works

The optimizer receives:

- **Original brief**: The user's initial description
- **Current prompt**: The prompt from the previous iteration
- **Judge feedback**: Structured evaluations from all judges, including scores, TOP_ISSUE, whatWorked, and promptInstructions
- **RAG context**: Relevant document chunks retrieved from judge reference materials
- **Negative prompts**: Accumulated list of problems to avoid
- **Reference image awareness**: Whether reference images are provided

### Structured Prompt Output

The optimizer produces a 500-1000+ word prompt organized into five mandatory sections:

1. **TECHNICAL PARAMETERS** — Camera type, lens, focal length, lighting setup, resolution, depth of field, color profile
2. **COMPOSITION & NARRATIVE** — Focal point, framing, perspective, visual flow, rule of thirds, leading lines
3. **SETTING & AMBIANCE** — Location, time of day, mood, color palette, atmosphere, environmental details
4. **KEY OBJECTS** — Exhaustive inventory of every object with exact shape, material, color, placement, and relative position
5. **FINAL NOTES** — Overall style, things to explicitly avoid, emphasis areas, quality targets

### Feedback Integration Rules

The optimizer follows strict rules for incorporating judge feedback:

- **`promptInstructions`** are incorporated **verbatim** — judges can inject exact language into the next prompt
- **`whatWorked`** language is preserved to avoid regressing on successful aspects
- **Critical issues** (from TOP_ISSUE) are addressed first in the prompt
- **Negative prompts** are included as explicit avoidance instructions
- **Previous prompts** are available for reference to avoid repeating failed approaches

### Edit Instructions

When the generation strategy selects "edit" mode, the optimizer produces a different output: a focused 1-3 sentence edit instruction derived from the TOP_ISSUE feedback. Edit instructions follow the pattern:

```
"Change only the [specific element] to [target specification]. Keep everything else exactly the same."
```

This precision prevents the edit from disrupting aspects that already scored well.

---

## Generation Modes & Strategy Selection

The system supports three generation modes, each suited to different scenarios. The mode determines whether each iteration generates entirely new images or refines the previous best.

### Regeneration Mode

Every iteration generates completely new images from the optimized prompt. Best for early iterations where the overall composition needs to change, or when the current direction is fundamentally wrong.

- Maximum iterations: 50
- Each iteration starts fresh from the prompt
- Allows dramatic changes between iterations

### Edit Mode

Every iteration takes the previous best image and applies targeted modifications based on judge feedback. Best when the composition is mostly correct but specific details need refinement.

- Maximum iterations: 5 (to prevent quality degradation)
- Edit instructions are 1-3 sentences derived from TOP_ISSUE
- All N images in a batch start from the **same source** (parallel variations, not sequential edits)
- Automatic fallback to regeneration if Gemini rejects the edit

### Mixed Mode (Adaptive)

The system automatically selects between regeneration and editing based on the current state. This is the most sophisticated mode, using a decision tree that considers:

```
Iteration 1                          → Regenerate (no image to edit)
Score < 50                           → Regenerate (bad foundation)
Consecutive edits ≥ 3                → Regenerate (prevent degradation)
TOP_ISSUE severity = critical/major  → Regenerate (fundamental problem)
TOP_ISSUE severity = moderate/minor  → Edit (targeted fix)
Score plateauing AND score ≥ 65      → Edit (break plateau with targeted change)
Default                              → Regenerate
```

The consecutive edit counter resets each time the strategy switches to regeneration, preventing unbounded quality degradation from sequential edits.

- Maximum iterations: 20

---

## RAG Document System

Judge agents can be augmented with reference documents — brand guidelines, specification sheets, style guides, or any text content — that provide domain-specific context during evaluation.

### Document Processing Pipeline

When a document is uploaded to a judge agent:

1. **Parse** — Extract text based on MIME type:
   - **PDF**: Parsed with `pdf-parse`, extracts full text with page count
   - **DOCX**: Parsed with `mammoth`, extracts raw text content
   - **TXT**: Direct UTF-8 decode

2. **Chunk** — Split into overlapping segments:
   - Chunk size: 1000 characters
   - Overlap: 200 characters between chunks
   - Intelligent boundary detection: prefers sentence boundaries (periods), falls back to word boundaries

3. **Embed** — Generate vector embeddings for each chunk:
   - Model: OpenAI `text-embedding-3-small` (1536 dimensions)
   - Processed in batches of 10 to avoid rate limits

4. **Store** — Save chunks with embeddings as JSONB on the `AgentDocument` entity

### RAG Retrieval During Evaluation

When a judge evaluates an image, the system:

1. Embeds the search query (brief + prompt used)
2. Calculates cosine similarity against all document chunks for that agent
3. Filters by similarity threshold (default: 0.7)
4. Returns top-K chunks (default: 5) sorted by similarity
5. Injects matching chunks as "Reference Guidelines" in the evaluation prompt

This allows judges to make evaluation decisions grounded in actual brand specifications, style guides, or product requirements — not just their system prompt.

### S3 Storage

Documents are stored in S3 with the path structure:

```
agent-documents/{orgId}/{agentId}/{timestamp}-{filename}
```

---

## Image Compliance Tool

The compliance tool enables batch evaluation of existing images against judge panels. Unlike the iterative generation pipeline, the compliance tool evaluates images as-is without generating new ones — useful for quality assurance, brand compliance audits, and content review.

### Features

- **Bulk Processing**: Evaluate up to 50 images per session
- **Three Input Methods**: File upload (drag-and-drop), URL input, or browse previously generated images
- **Concurrent Queue**: Processes up to 3 evaluations simultaneously with automatic scheduling
- **Multi-Judge Scoring**: Each image evaluated by all selected judges with weighted aggregation
- **Score Classification**: Images categorized as passed (≥80%), warned (≥60%), or failed (<60%)
- **Summary Statistics**: Real-time totals for passed/warned/failed/error counts and average score
- **Detail Modal**: View individual judge evaluations, category scores, and feedback for any image

### Queue Architecture

The compliance tool uses a client-side queue that:

1. Accepts images in any state (uploading, queued, evaluating)
2. Automatically starts evaluation when judges are selected
3. Limits concurrency to 3 parallel evaluations
4. Handles cancellation if an image is removed mid-evaluation
5. Manages blob URL lifecycle (creation and revocation) to prevent memory leaks

---

## Project Management

Generation requests can be organized into projects, providing a logical grouping layer for related work.

### Features

- **Project CRUD**: Create, list, update, and delete projects within an organization
- **Request Scoping**: Generation requests optionally belong to a project, filtering views to relevant work
- **Soft Delete**: Projects use logical deletion (`deletedAt` column) to preserve history and relationships
- **Flexible Settings**: Each project has a JSONB settings field for extensible configuration
- **Nested Navigation**: Tools accessed within a project context (e.g., `/projects/:projectId/generation`) inherit the project scope

---

## Real-Time Streaming

The platform uses Server-Sent Events (SSE) to push real-time updates from the orchestration pipeline to the frontend.

### Event Types

| Event                | Payload                                          | When Emitted                          |
| -------------------- | ------------------------------------------------ | ------------------------------------- |
| `INITIAL_STATE`      | Full request state                               | On SSE connection establishment       |
| `STATUS_CHANGE`      | New status value                                 | On each status transition             |
| `ITERATION_COMPLETE` | Iteration snapshot with scores, images, feedback | After each iteration finishes         |
| `COMPLETED`          | Final state with completion reason               | When request reaches terminal success |
| `FAILED`             | Error message and final state                    | When request fails                    |

### Frontend Integration

The `GenerationDetailPage` connects to the SSE stream when viewing an active request. The page displays:

- **Live badge**: Visual indicator that the SSE connection is active
- **Progress bar**: Shows iteration count with a visual fill proportional to `currentIteration / maxIterations`, plus a threshold marker line
- **Iteration timeline**: Each completed iteration renders as a `RoundCard` component with scores, images, prompts, and judge feedback
- **Auto-scroll**: The timeline automatically scrolls to reveal new iterations as they complete
- **Graceful disconnect**: The SSE connection closes when the request reaches a terminal state or when the user navigates away

---

## Algorithms & Design Principles

### Plateau Detection

The system detects when iterative improvement has stalled using a sliding window variance check:

```
isScorePlateauing(windowSize = 3, threshold = 0.02):
  recentScores = last N iteration scores
  maxImprovement = max(recentScores) - min(recentScores)
  return maxImprovement < threshold × max(recentScores)
```

If the variance in the last 3 iterations is less than 2% of the maximum score, the system concludes that further iterations are unlikely to produce meaningful improvement and terminates with `DIMINISHING_RETURNS`. This saves compute costs and prevents the optimizer from making lateral changes that don't improve quality.

The window size and threshold are configurable per request via `imageParams.plateauWindowSize` and `imageParams.plateauThreshold`.

### Negative Prompt Accumulation

Rather than discarding judge feedback between iterations, the system maintains a growing list of problems to avoid:

1. After each evaluation, `TOP_ISSUE.problem` and `TOP_ISSUE.fix` are extracted from each judge
2. New entries are deduplicated against the existing list
3. Entries are sorted by severity (critical → major → moderate → minor)
4. The list is capped at 10 entries (FIFO eviction when full)
5. Format: `AVOID: [problem] - [fix] (from [agent name])`

This prevents the optimizer from re-introducing previously fixed problems — a common failure mode in iterative generation where fixing one issue inadvertently recreates another.

### Retry with Exponential Backoff

All external API calls (Gemini generation, S3 uploads, LLM evaluations) use a retry wrapper:

- **Max retries**: 3
- **Base delay**: 1000ms
- **Backoff multiplier**: 2x (delays: 1s → 2s → 4s)
- **Per-call retry**: Each image or evaluation retries independently; one failure doesn't block the batch

### Resilient Parallel Execution

The pipeline uses `Promise.allSettled()` (not `Promise.all()`) for all parallelized operations:

- Multiple images generated in parallel per iteration
- All images evaluated across all judges in parallel
- S3 uploads parallelized across all generated images
- A single failure in the batch is logged and handled without blocking successful results

### Weighted Dual-Purpose Scoring

Each judge has **two independent weights**:

- **`scoringWeight`**: Determines influence on the aggregate quality score used for threshold comparison
- **`optimizationWeight`**: Determines influence on prompt optimization prioritization

This separation allows a judge to be highly influential on score calculation while having less influence on prompt direction (or vice versa). For example, a brand compliance judge might have high scoring weight (its opinion matters for pass/fail) but moderate optimization weight (other judges may provide more actionable prompt improvements).

### Edit vs. Regenerate Decision Logic

The mixed mode strategy selector balances two competing concerns: **exploration** (trying new compositions via regeneration) and **exploitation** (refining promising compositions via editing). The decision tree considers:

- **Score level**: Low scores suggest the composition needs fundamental changes (regenerate)
- **Issue severity**: Critical/major issues indicate structural problems (regenerate); moderate/minor issues are refinable (edit)
- **Edit fatigue**: After 3 consecutive edits, quality tends to degrade (regenerate to reset)
- **Plateau state**: If scores are plateauing above 65%, a targeted edit may break the plateau better than a full regeneration

---

## Web Application

The Angular frontend provides a complete interface for managing the image generation pipeline.

### Toolbox Home Page

The home page (`/home`) presents a tool launcher grid with all available platform tools. Each tool card shows a name, description, and icon, routing to the corresponding feature page.

### Iterative Image Generation

**List View** (`/iterative-image-generation`):

- Card grid of all generation requests with status icons, iteration progress, best score, and thumbnail
- Color-coded status indicators (yellow=pending, blue=active, green=completed, red=failed, gray=cancelled)
- Clickable cards navigate to the detail view

**New Request** (`/iterative-image-generation/new`):

- Brief text area (required) and optional initial prompt override
- Image settings: images per generation (1-4), aspect ratio selection, reference image upload (up to 5)
- Configuration: generation mode selector with dynamic max iteration limits, judge multi-selector, iteration count, and score threshold
- Validation enforces brief + at least one judge before submission

**Detail View** (`/iterative-image-generation/:id`):

- Real-time SSE connection with live indicator badge
- Brief display and final/latest image hero
- Score hero with large percentage display, target threshold marker, and visual progress bar
- Iteration timeline of collapsible `RoundCard` components
- Completion banner with reason code
- Continuation editor for resuming with modified parameters

### Round Card Component

Each iteration renders as a collapsible card displaying:

- **Header**: Iteration number, mode tag (Edit/Regen), color-coded score chip
- **Thumbnails**: Grid of generated images with checkmark on the selected winner
- **Prompt**: Collapsible section showing the optimized prompt used
- **Top Issue**: Problem statement, severity badge, and fix suggestion
- **Judge Evaluations**: Accordion of per-judge results with scores, category breakdowns, checklists, and feedback

### Judge Administration

Accessible at `/organization/admin/judges`, the judge management interface allows:

- Creating and editing judge agents with full configuration (name, system prompt, categories, weights, RAG settings)
- Uploading reference documents (PDF, DOCX, TXT) for RAG augmentation
- Managing document lifecycle (upload, list, delete)
- Previewing evaluation behavior with the embedded image evaluator component

---

## AI Framework

The AI framework provides a unified interface for multiple LLM providers, abstracting away provider-specific APIs while maintaining access to advanced features.

### Supported Providers

| Provider     | Text | Streaming | Vision | Images | Audio | Embeddings | Functions |
| ------------ | ---- | --------- | ------ | ------ | ----- | ---------- | --------- |
| OpenAI       | ✅   | ✅        | ✅     | ✅     | ✅    | ✅         | ✅        |
| Anthropic    | ✅   | ✅        | ✅     | ❌     | ❌    | ❌         | ✅        |
| Google       | ✅   | ✅        | ✅     | ❌     | ❌    | ✅         | ✅        |
| Azure OpenAI | ✅   | ✅        | ✅     | ✅     | ✅    | ✅         | ✅        |
| AWS Bedrock  | ✅   | ✅        | ✅     | ✅     | ❌    | ✅         | ✅        |

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      AIService                          │
│  (Unified facade - selects provider per modality)       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │ OpenAI  │ │Anthropic│ │ Google  │ │ Bedrock │      │
│  │ Client  │ │ Client  │ │ Client  │ │ Client  │      │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘      │
│       │           │           │           │            │
│       ▼           ▼           ▼           ▼            │
│  ┌──────────────────────────────────────────────┐      │
│  │          Provider-Specific SDKs              │      │
│  │  (openai, @anthropic-ai/sdk, @google/genai)  │      │
│  └──────────────────────────────────────────────┘      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Usage Examples

```typescript
import { AIService } from "./ai/ai.service";
import { AIProvider, AIModel } from "./_core/third-party/ai";

// Text generation with automatic provider selection
const response = await aiService.generateText({
  messages: [{ role: "user", content: "Explain quantum computing" }],
});

// Specify provider and model explicitly
const response = await aiService.generateText({
  provider: AIProvider.Anthropic,
  model: AIModel.Claude35Sonnet,
  messages: [{ role: "user", content: "Write a haiku" }],
  maxTokens: 100,
});

// Streaming responses
for await (const chunk of aiService.generateTextStream(request)) {
  process.stdout.write(chunk.content);
}

// Image generation
const image = await aiService.generateImage({
  prompt: "A sunset over mountains",
  size: "1024x1024",
  quality: "hd",
});

// Vision analysis
const analysis = await aiService.analyzeImage({
  images: [{ base64: imageData, mimeType: "image/png" }],
  prompt: "Describe what you see",
});

// Embeddings for semantic search
const embeddings = await aiService.generateEmbedding({
  input: ["Document text to embed"],
  model: AIModel.TextEmbedding3Small,
});
```

### Cost Tracking

The framework automatically tracks costs per request:

```typescript
// Cost is included in every response
const response = await aiService.generateText(request);
console.log(`Request cost: $${response.usage.estimatedCost}`);

// Configure cost alerts
AI_COST_ALERT_THRESHOLD=100  # Alert when daily costs exceed $100
```

### Provider Fallback Chain

Configure automatic fallback when primary providers fail:

```bash
AI_DEFAULT_TEXT_PROVIDER=anthropic
AI_FALLBACK_TEXT_PROVIDER=openai
```

---

## Authentication System

The authentication system supports multiple strategies, configurable per organization.

### Strategy Types

#### 1. Basic (Code-Based)

Passwordless authentication using one-time codes sent via email.

```
User enters email → Code sent → User enters code → JWT issued
```

Configuration:

- Code length (default: 6 digits)
- Code lifetime (default: 10 minutes)
- Rate limiting per email

#### 2. Okta (OAuth 2.0 / OIDC)

Enterprise SSO via Okta with automatic user provisioning.

```
User redirected → Okta login → Token validated → JWT issued
```

Configuration per organization:

```typescript
{
  type: 'okta',
  config: {
    oktaDomain: 'your-org.okta.com',
    clientId: 'xxx',
    uiType: 'redirect' | 'widget'
  }
}
```

#### 3. SAML 2.0

Enterprise identity federation for large organizations.

Features:

- SP-initiated SSO
- Challenge/response with nonce
- Automatic user provisioning
- Attribute mapping

#### 4. WPP Open SSO

Native integration with WPP Open workspaces for seamless authentication.

```
WPP Open token → Validated → Workspace hierarchy checked → JWT issued
```

Features:

- Automatic user creation
- Workspace-to-Space mapping
- Tenant ID scoping
- Redirect to appropriate Space

### Token Management

- JWTs with configurable expiration
- Token array per user (supports multiple sessions)
- Automatic stale token cleanup
- Revocation on sign-out

### User Roles

```
SuperAdmin → Full system access
    │
Admin → Organization-wide access
    │
Manager → Can manage users within spaces
    │
User → Standard access
    │
Guest → Limited read-only access
```

---

## Multi-Tenant Architecture

### Hierarchy

```
Organization
├── Authentication Strategies (1:many)
├── Spaces (1:many)
│   ├── Space Users (users with space-specific roles)
│   └── Space Settings (JSON configuration)
└── Users (1:many)
    ├── Permissions (fine-grained access)
    └── User Spaces (many:many with roles)
```

### Organization Scoping

All API endpoints are organization-scoped by default:

```typescript
// Controllers
@Controller('organization/:orgId/projects')
export class ProjectController {
  @UseGuards(AuthGuard(), HasOrganizationAccessGuard)
  @Get()
  findAll(@Param('orgId') orgId: string) {
    return this.projectService.findByOrg(orgId);
  }
}

// Services
async findByOrg(orgId: string): Promise<Project[]> {
  return this.repo.find({ where: { organizationId: orgId } });
}
```

### Spaces

Spaces provide collaborative isolation within an organization:

- **Public Spaces**: Visible to all org members
- **Private Spaces**: Invite-only access
- **Space Roles**: Admin (manage space), User (standard access)
- **WPP Open Integration**: Map external workspace IDs to spaces

### Guards

| Guard                        | Purpose                        |
| ---------------------------- | ------------------------------ |
| `AuthGuard()`                | Validates JWT token            |
| `RolesGuard`                 | Checks user role meets minimum |
| `PermissionsGuard`           | Checks specific permissions    |
| `HasOrganizationAccessGuard` | Validates org membership       |
| `SpaceAccessGuard`           | Validates space access         |
| `SpaceAdminGuard`            | Requires space admin role      |

---

## Notification System

A multi-provider notification system supporting email delivery with template management.

### Providers

1. **AWS SES** - Default email provider
2. **SendGrid** - Dynamic templates with merge tags
3. **Adobe Journey Optimizer** - Enterprise marketing automation

### Template System

Templates are file-based with Handlebars syntax:

```
apps/api/src/notification/templates/
├── welcome/
│   ├── template.html
│   ├── template.txt
│   └── translations/
│       └── en-US.json
└── login-code/
    ├── template.html
    └── template.txt
```

### Usage

```typescript
await notificationService.sendTemplate(
  "login-code", // Template name
  organizationId, // Org-specific customization
  { to: "user@email.com" },
  { SINGLE_PASS: "123456" }, // Merge tags
  null,
  null,
  null,
  "Organization Name",
);
```

### Features

- HTML + plain text variants
- Per-organization template overrides
- Locale-based translations
- Merge tag mapping per provider
- BCC and CC support
- Delivery tracking

---

## Theming & Design System

The application uses PrimeNG v20 with a custom WPP Open-inspired design system.

### Architecture

```typescript
// Programmatic theme configuration in app.module.ts
providePrimeNG({
  theme: {
    preset: Lara,
    options: {
      prefix: "p",
      darkModeSelector: ".p-dark",
      cssLayer: false,
    },
  },
  ripple: true,
  inputVariant: "outlined",
});
```

### Color Palette

The primary palette uses WPP Open purple:

```scss
--p-primary-50: #f5f0fa; // Lightest
--p-primary-500: #5e00b5; // Primary brand color
--p-primary-950: #1a0033; // Darkest
```

### Theme Service

Reactive theme management with system preference detection:

```typescript
@Injectable()
export class ThemeService {
  private currentTheme = signal<"light" | "dark" | "auto">("auto");

  // Automatically tracks system preference changes
  // Persists user preference to localStorage
  // Updates theme-color meta tag for mobile
}
```

### Dark Mode

Toggle dark mode with a single class:

```typescript
// Apply dark mode
document.documentElement.classList.add("p-dark");

// Or use the service
themeService.setTheme("dark");
```

### CSS Variables

Override any PrimeNG variable in `_primeng-theme.scss`:

```scss
:root {
  // Colors
  --p-primary-color: #5e00b5;
  --p-surface-ground: #fafafa;

  // Typography
  --p-font-family: "Inter", sans-serif;

  // Spacing
  --p-form-field-padding-x: 0.875rem;

  // Shadows
  --p-overlay-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
```

---

## Third-Party Integrations

All integrations live in `apps/api/src/_core/third-party/`:

### AWS Services

| Service | File             | Purpose                            |
| ------- | ---------------- | ---------------------------------- |
| S3      | `aws.s3.ts`      | File storage with automatic naming |
| SES     | `aws.ses.ts`     | Email delivery                     |
| SQS     | `aws.sqs.ts`     | Message queuing                    |
| Lambda  | `aws.lambda.ts`  | Serverless function invocation     |
| Cognito | `aws.cognito.ts` | User authentication                |

### WPP Open

Integration with WPP Open workspace platform:

```typescript
// Validate a WPP Open token
const result = await WPPOpen.validateToken(token);

// Get workspace hierarchy
const hierarchy = await WPPOpen.getWorkspaceAncestor(
  token,
  workspaceId,
  scopeId,
);
```

### Strapi CMS

Headless CMS integration for content management:

```typescript
// Query Strapi collections
const pages = await strapi.getCollection("pages", {
  filters: { slug: "home" },
  populate: "*",
});
```

### Adobe Journey Optimizer

Enterprise marketing automation:

```typescript
// Send marketing email
await ajo.sendEmail({
  templateId: "campaign-123",
  recipient: "user@email.com",
  variables: { firstName: "John" },
});
```

---

## Console Commands

CLI commands for common operations:

```bash
# From apps/api directory
npm run console:dev <command>
```

### Available Commands

| Command                  | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `InstallOrganization`    | Interactive setup of org, user, and auth           |
| `GetUserToken <userId>`  | Generate JWT for API testing                       |
| `AddEntity <EntityName>` | Scaffold new entity with controller, service, DTOs |

### Entity Scaffolding

The `AddEntity` command generates:

```
apps/api/src/<entity>/
├── <entity>.entity.ts        # TypeORM entity
├── <entity>.controller.ts    # REST controller
├── <entity>.service.ts       # Business logic
├── <entity>.module.ts        # NestJS module
└── dtos/
    ├── <entity>.dto.ts       # Response DTO
    ├── <entity>-create.dto.ts
    └── <entity>-update.dto.ts
```

And automatically updates:

- `app.module.ts` - Registers the module
- `common.module.ts` - Adds service to common exports
- `database.module.ts` - Registers entity

---

## API Documentation

When `SWAGGER_ENABLE=true`:

- **Swagger UI**: http://localhost:8001/api
- **OpenAPI JSON**: http://localhost:8001/api-json

### Getting a Bearer Token

For API testing, generate a token:

```bash
# Via console command
npm run console:dev GetUserToken <user-id>

# Via test endpoint (requires ENABLE_TEST_AUTH=true)
curl http://localhost:8001/user/dev/test-tokens
```

### Using the Token

```bash
curl -X GET http://localhost:8001/user/refresh \
  -H "Authorization: Bearer YOUR-JWT-TOKEN"
```

---

## Security Features

### Fraud Prevention

Located in `apps/api/src/_core/fraud-prevention/`:

- **Email Normalization**: Standardizes email addresses before storage
- **Form Validation**: Field-level validators for common inputs
- **Crypto Utilities**: Encryption/decryption for sensitive data

### API Keys

Secure API key management with:

- Encrypted storage (128-byte random keys)
- Organization scoping
- Expiration support
- Automatic usage logging
- Request metadata capture

### Input Validation

All DTOs use class-validator decorators:

```typescript
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  firstName: string;
}
```

---

## Deployment

### GitHub Actions

Sample workflows in `.github/workflows-disabled/`:

1. Rename to `.github/workflows/`
2. Update `YOUR-APP-NAME` in workflow files
3. Configure secrets in GitHub repository

### Environment Variables

Production checklist:

- [ ] `DATABASE_SYNCHRONIZE=false`
- [ ] Generate unique signing keys
- [ ] Configure real AWS credentials
- [ ] Set appropriate `ORIGINS`
- [ ] Enable HTTPS

### Database Migrations

For production, use TypeORM migrations:

```bash
# Generate migration
npm run typeorm migration:generate -- -n MigrationName

# Run migrations
npm run typeorm migration:run
```

---

## Related Documentation

- [AGENTS.md](./AGENTS.md) - AI agent guidelines and coding conventions
- [PRD_DEFAULTS.md](./PRD_DEFAULTS.md) - Architectural defaults for new features
- [Theme README](./apps/web/src/theme/README.md) - Detailed theming documentation
- [Image Generation Overview](./apps/docs/image-generation/overview.md) - System architecture and key concepts
- [Orchestration Pipeline](./apps/docs/image-generation/orchestration.md) - Deep dive into the iteration loop
- [Agents & Evaluation](./apps/docs/image-generation/agents-and-evaluation.md) - Judge configuration and scoring
- [Prompt Optimization](./apps/docs/image-generation/prompt-optimization.md) - How prompts are refined between iterations
- [Gemini Integration](./apps/docs/image-generation/gemini-integration.md) - Image generation via the Gemini API
- [RAG Documents](./apps/docs/image-generation/rag-documents.md) - Reference document upload and retrieval
- [Events & Streaming](./apps/docs/image-generation/events-and-streaming.md) - Real-time SSE event system

---

## License

Proprietary - VML/WPP
