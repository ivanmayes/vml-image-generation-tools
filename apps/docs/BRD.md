Optimized Image Generator — Business Requirements Document
Executive Summary
Product Name: Optimized Image Generator
Parent Project: vml-image-generation-tools
Type: Backend API Service (NestJS)
A multi-agent orchestration system for AI image generation with iterative quality control. Users submit a human-readable brief, which is optimized by a committee of configurable judge agents, then synthesized by a dedicated Prompt Optimizer into an image generation prompt. Generated images are evaluated by the judges against configurable criteria. The system iterates until quality thresholds are met or retry limits are reached.

Core Workflow
Phase 1: Request Submission

User submits:

Brief: Freeform text (no validation/minimum length required)
Reference images (optional): Passed directly to image generation API for style matching
Negative prompts (optional): Things to avoid in generation
Judge selection: Array of judge agent IDs to use for this request (minimum 1 judge)
Image parameters: Dimensions, aspect ratio, quality settings (user-specified per-request)
Images per generation: Configurable 1-4 images per iteration
Threshold override (optional): Score required to pass (default from ENV)
Max iterations override (optional): Maximum retry attempts (default from ENV)



Phase 2: Prompt Optimization

Each selected judge agent reviews the original brief and suggests modifications based on their expertise/guidelines
Judges process cumulatively in priority order (lowest optimization weight first → highest weight last, giving high-authority agents "last word")
The single global Prompt Optimizer agent synthesizes all judge suggestions into one optimized prompt
Optimizer outputs the optimized prompt only (no rationale/explanation)

Phase 3: Image Generation

Call configured image generation provider (default: Gemini Flash Image 3)
Generate 1-4 images based on request configuration
On API failure: Auto-retry with fixed retry count (e.g., 3 attempts)
Infrastructure retries are free (do not count against max iterations budget)
Store all generated images to S3

Phase 4: Evaluation

All judges evaluate in parallel (simultaneously)
Each judge scores all generated images for the iteration
System selects the image with the highest weighted average score
Scoring structure per judge:

Overall score (0-100)
Structured category scores (categories defined via freeform text in agent config; agent dynamically decides category importance)
Freeform notes/feedback


If image passes threshold: Return scores only (no detailed feedback needed)
If image fails threshold: Return full feedback for re-optimization
Always run all judges (no short-circuiting even if early judge scores very low)

Phase 5: Iteration (if threshold not met)

Collect all individual judge scores and feedback (Optimizer sees everything)
Send only the best-scoring image to Optimizer with all feedback
Optimizer re-optimizes using hybrid approach: builds on previous prompt with full iteration history context
Judges can suggest additional negative prompts in their feedback
Same judge panel remains fixed throughout all iterations
Repeat until:

Weighted average score ≥ threshold → SUCCESS
Iterations ≥ max iterations → MAX_RETRIES_REACHED (return best attempt)



Conflict Resolution

When judges provide conflicting feedback, use weighted priority system based on agent scoring weights


Agent Architecture
Judge Agents

Scope: Per-tenant (fully isolated between organizations)
Templates: System ships with predefined templates (Legal, Brand, Style, etc.) as starting points; fully customizable
Definition includes:

System prompt
Uploaded reference documents (version controlled, updatable anytime)
RAG configuration for knowledge base
Freeform text defining evaluation categories
Optimization weight (determines order in cumulative optimization; lower = earlier)
Scoring weight (determines influence on final weighted average score)


Deletion: Soft delete (archived, can restore) to preserve historical request integrity

Prompt Optimizer Agent

Scope: Global (system-wide, shared across all tenants)
Single instance that synthesizes all judge suggestions
Configurable via admin API

Reference Documents (for Agents)

Formats supported: PDF, DOCX/Word, TXT/Markdown, Images (visual style guides), JSON/structured data
Versioning: Upload anytime, version controlled
Usage: RAG-style (chunk and retrieve relevant sections using OpenAI embeddings + pgvector)
During request: Always use latest version (even if docs update mid-iteration)
Token limits: None (trust LLM context window)


API Design
Framework & Stack

Framework: NestJS
Database: PostgreSQL with TypeORM
Vector Store: pgvector (PostgreSQL extension)
Queue: pg-boss (PostgreSQL-based job queue)
Storage: AWS S3 for images
LLM: Google Gemini Flash (for all agents)
Image Generation: Configurable provider, default Gemini Flash Image 3
Authentication: JWT/OAuth tokens
Documentation: OpenAPI/Swagger auto-generated from NestJS decorators

Async Model

Pattern: Asynchronous with polling endpoint (no webhooks)
Queue: Simple FIFO processing
Cancellation: Allowed; returns best attempt so far
Rate limiting: None (trust infrastructure)

Response Structure
Consistent structure for both success and max-retries-reached:
{
  status: "SUCCESS" | "MAX_RETRIES_REACHED",
  message: string,
  finalImage: {
    url: string (direct S3 URL),
    score: number,
    prompt: string
  },
  iterationHistory: [
    {
      iteration: number,
      prompt: string,
      images: [{ url, scores, feedback }],
      selectedImageIndex: number,
      aggregateScore: number
    }
  ],
  costs: {
    llmTokens: number,
    imageGenerations: number,
    totalEstimatedCost: number
  }
}
Endpoints Required
Generation Flow:

POST /requests - Submit new generation request
GET /requests/:id/status - Poll for status
GET /requests/:id - Get full result
POST /requests/:id/cancel - Cancel and return best attempt

Agent Management (CRUD):

GET/POST/PUT/DELETE /agents - Judge agent management
GET/PUT /optimizer - Global Prompt Optimizer configuration
POST /agents/:id/documents - Upload reference documents
GET/DELETE /agents/:id/documents/:docId - Manage documents

Request History:

GET /requests - List requests (with filters)
GET /requests/:id/iterations - Get iteration details

Analytics Endpoints:

Average iterations to pass (by time period, by tenant)
Cost per request / per tenant
Agent performance (which judges are hardest/easiest)
Average scores over time

Templates:

GET /agent-templates - List available starting templates


Multi-Tenancy

Integrates with existing boilerplate org/tenant system
Judge agents: Fully isolated per-tenant
Prompt Optimizer: Global (shared across all tenants)
Data isolation: Complete separation of requests, images, analytics per tenant


Logging & Debugging
Debug Dump (toggleable via ENV)

Toggle: DEBUG_DUMP_ENABLED environment variable
Structure: Nested folders by request_id/iteration_n/
Contents per request: Single consolidated JSON file containing:

Original brief and parameters
All agent interactions (prompts, responses)
All generated images (copied to folder)
All scores and feedback
Timing information
Cost breakdown



Comprehensive Logging

All LLM calls (input/output)
All image generation calls
Agent processing order and timing
Score calculations
Iteration decisions


Configuration
Environment Variables
VariablePurposeDEBUG_DUMP_ENABLEDToggle debug folder dumps (true/false)MAX_ITERATIONS_DEFAULTDefault max iterations if not specified per-requestPASSING_THRESHOLD_DEFAULTDefault passing score (0-100) if not specified per-request
Admin-Configurable (via API/DB)

IMAGE_RETRY_COUNT - Fixed retry count on image generation failures
LLM_MODEL - Gemini Flash model version
DEFAULT_IMAGE_PROVIDER - Default image generation provider
Image generation provider credentials
LLM provider credentials


Technical Requirements
Database Schema (Key Entities)

Tenants (from boilerplate)
Agents (judge agents, per-tenant, soft-delete)
AgentDocuments (versioned reference docs)
AgentDocumentChunks (for RAG, with embeddings)
PromptOptimizer (global config)
Requests (generation requests)
Iterations (per-request iteration history)
GeneratedImages (all images with scores)
AgentEvaluations (individual judge scores/feedback)

External Integrations

Google Gemini Flash - LLM for agents
Google Gemini Flash Image 3 - Default image generation (support for additional providers)
OpenAI - Embeddings for RAG
AWS S3 - Image storage

Development

Uses existing boilerplate for project setup
Comprehensive unit + integration test coverage required
Docker setup via boilerplate


Out of Scope (Future)

Admin web UI (API-only for now)
Webhook callbacks (polling only)
Rate limiting per tenant
Seed data / test fixtures
Multiple Prompt Optimizers per tenant
Real-time streaming of progress


Summary of Key Decisions
DecisionChoiceOptimization flowCumulative (each agent builds on previous)Optimization orderLowest weight first (highest authority last)WeightsSeparate for optimization vs scoringHigh-authority handlingHeavily weighted scores (no veto power)Judge feedback to OptimizerFull visibility (all individual scores/feedback)Images per iterationConfigurable 1-4Multi-image evaluationEach judge scores all, system picks highest avgOn passScores only (no detailed feedback)On failure iterationBest image only sent for feedbackConflict resolutionWeighted priority systemLLM for agentsSingle model (Gemini Flash) for allNegative promptsUser-provided + judge-suggestedReference imagesPassed to image gen API onlyAsync modelPolling only (no webhooks)Response on max retriesSame structure as success with status indicatorAgent deletionSoft delete (preserve history)Document versioningVersioned, always use latestRAG approachChunk + retrieve relevant sectionsMulti-tenancyPer-tenant agents, global optimizer

This document should provide a planning agent with complete context to architect and implement the Optimized Image Generator system.