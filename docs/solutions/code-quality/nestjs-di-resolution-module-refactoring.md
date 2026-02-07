---
title: "NestJS DI Resolution: Module Refactoring & Dependency Injection"
date: 2026-02-07
category: code-quality
module: apps/api/image-generation
tags:
  - nestjs
  - dependency-injection
  - module-architecture
  - refactoring
  - error-resolution
  - angular
  - webpack
symptoms:
  - "Nest can't resolve dependencies of DebugController - AgentService not available"
  - "Nest can't resolve dependencies of GenerationRequestController - JwtService not available"
  - "Cannot find module '@api/agent/dtos' after file relocation"
  - "Stale TypeScript module resolution in running ng serve process"
root_cause: >
  During refactoring to extract the Agent module from image-generation to a higher
  level in the module hierarchy, module imports were not properly maintained. When
  controllers from one module depend on services from another module, the parent
  module must import those dependency modules. Additionally, a pre-existing bug
  showed that when adding new dependencies to controllers, the parent module's
  imports and providers must be updated to match.
related_docs:
  - docs/plans/2026-02-07-refactor-agent-module-root-level-extraction-plan.md
  - docs/solutions/feature-implementation/edit-mode-mixed-mode-image-generation.md
  - docs/solutions/code-quality/bulk-image-compliance-8-agent-review-fixes.md
---

# NestJS DI Resolution: Module Refactoring & Dependency Injection

## Context

During a refactor to extract the `AgentModule` from `apps/api/src/image-generation/agent/` to `apps/api/src/agent/`, breaking changes in module dependencies caused NestJS dependency injection to fail at application startup. Additionally, a pre-existing bug was discovered where new dependencies were added to a controller without updating the parent module.

Two critical issues and one supporting issue (stale build cache) are documented below.

## Issue 1: DebugController Missing AgentService Dependency

### Symptom

```
Nest can't resolve dependencies of the DebugController
(GenerationRequestService, ?, JobQueueService).
Please make sure that the argument AgentService at index [1]
is available in the ImageGenerationModule context.
```

### Root Cause

When the `AgentModule` was extracted to a higher level in the module hierarchy, it was removed from `ImageGenerationModule`'s imports array. However, `DebugController` (registered on `ImageGenerationModule`) directly injects `AgentService` (exported from `AgentModule`). Since NestJS only resolves dependencies available within the module's own imports, the injection failed.

**Key Principle:** When extracting a NestJS module to a higher level, all modules that still have controllers/providers depending on the extracted module's exports must keep it in their imports array.

### Fix

**File:** `apps/api/src/image-generation/image-generation.module.ts`

Added `AgentModule` back to `ImageGenerationModule`'s imports:

```typescript
import { AgentModule } from "../agent/agent.module";

@Module({
  imports: [
    AgentModule, // Re-added: DebugController depends on AgentService
    DocumentProcessorModule,
    PromptOptimizerModule,
    GenerationRequestModule,
    ProjectModule,
    JobsModule,
    OrchestrationModule,
  ],
  controllers: isDevelopment ? [DebugController] : [],
  exports: [
    DocumentProcessorModule,
    PromptOptimizerModule,
    GenerationRequestModule,
    ProjectModule,
    JobsModule,
    OrchestrationModule,
  ],
})
export class ImageGenerationModule {}
```

Note: `AgentModule` is in `imports` but NOT `exports` here because `CommonModule` (the parent) now exports `AgentModule` directly. Only controllers within `ImageGenerationModule` need the import.

---

## Issue 2: GenerationRequestController Missing JwtService Dependency (Pre-existing)

### Symptom

```
Nest can't resolve dependencies of the GenerationRequestController
(GenerationRequestService, AgentService, JobQueueService,
GenerationEventsService, ?, AuthService).
Please make sure that the argument JwtService at index [4]
is available in the GenerationRequestModule context.
```

Also produced AuthGuard warnings about PassportModule not being registered.

### Root Cause

In a prior commit on the feature branch, `JwtService` and `AuthService` were added to `GenerationRequestController` to support JWT validation on the SSE streaming endpoint. However, `GenerationRequestModule` was never updated to provide these dependencies. This was a pre-existing bug — not caused by the agent module refactor — but surfaced during testing.

**Key Principle:** When adding new dependencies to a NestJS controller, the controller's parent module must be updated to:

1. Import the modules that export those dependencies (`JwtModule`, `PassportModule`)
2. Register any additional providers needed (`UserService`, `AuthService`)
3. Ensure TypeORM entities are available (`User` in `TypeOrmModule.forFeature()`)

### Fix

**File:** `apps/api/src/image-generation/generation-request/generation-request.module.ts`

```typescript
import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PassportModule } from "@nestjs/passport";
import { JwtModule } from "@nestjs/jwt";

import { User } from "../../user/user.entity";
import { UserService } from "../../user/user.service";
import { AuthService } from "../../user/auth/auth.service";
import { GenerationRequest, GeneratedImage } from "../entities";
import { AgentModule } from "../../agent/agent.module";
import { JobsModule } from "../jobs/jobs.module";
import { OrchestrationModule } from "../orchestration/orchestration.module";

import { GenerationRequestService } from "./generation-request.service";
import { GenerationRequestController } from "./generation-request.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([GenerationRequest, GeneratedImage, User]),
    AgentModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      privateKey: process.env.PRIVATE_KEY,
      publicKey: process.env.PUBLIC_KEY,
      signOptions: {
        expiresIn: "30days",
        algorithm: "RS256",
      },
    }),
    forwardRef(() => JobsModule),
    forwardRef(() => OrchestrationModule),
  ],
  controllers: [GenerationRequestController],
  providers: [GenerationRequestService, UserService, AuthService],
  exports: [GenerationRequestService],
})
export class GenerationRequestModule {}
```

---

## Issue 3: Stale Module Resolution in Running ng serve

### Symptom

After moving agent module files, the Angular dev server showed webpack compilation errors:

```
Cannot find module '@api/agent/dtos' or its corresponding type declarations.
```

The files existed at the resolved path (`apps/api/src/agent/dtos/index.ts`) and the tsconfig path alias (`@api/*` → `../api/src/*`) was correct.

### Root Cause

The running `ng serve` process maintained a stale TypeScript module resolution cache from before the file move. The webpack watcher did not properly invalidate path resolution for moved files.

### Fix

Kill and restart the `ng serve` process:

```bash
# Find and kill the process
lsof -i :4200 -P | grep LISTEN  # find PID
kill <PID>

# Restart with clean state
cd apps/web && ng serve --configuration=development
```

---

## Summary of Fixes Applied

| Issue                                                   | Module                  | Fix                                                                 | File                           |
| ------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------- | ------------------------------ |
| AgentService not available to DebugController           | ImageGenerationModule   | Re-import AgentModule                                               | `image-generation.module.ts`   |
| JwtService not available to GenerationRequestController | GenerationRequestModule | Import PassportModule, JwtModule; register AuthService, UserService | `generation-request.module.ts` |
| Stale build cache after file moves                      | Build system            | Restart ng serve                                                    | N/A                            |

## NestJS Module Refactoring Checklist

Use this checklist when extracting or moving a NestJS module:

### Pre-Refactoring

- [ ] Map all controllers/providers that inject services from the module being moved
- [ ] Identify all modules that import the module being moved
- [ ] Check for `forwardRef()` circular dependencies that may be affected
- [ ] Note which entities are registered in `TypeOrmModule.forFeature()`

### During Refactoring

- [ ] Update all import paths in consuming files
- [ ] Ensure every module whose controllers/providers depend on the moved module still imports it
- [ ] Update barrel exports (`index.ts`) at both old and new locations
- [ ] Update any path aliases in tsconfig files

### Post-Refactoring

- [ ] Run `nest build` or `tsc --noEmit` to catch compile errors
- [ ] Start the application (`node dist/main.js`) to catch DI resolution errors
- [ ] Restart all dev servers (`ng serve`, `nest start`)
- [ ] Grep for stale import paths: `grep -r "old/path" --include="*.ts"`
- [ ] Test all affected API endpoints

## Key Learnings

1. **Module import rules are strict:** In NestJS, services are only resolvable if they are exported from an imported module. Simply having the service defined elsewhere is not enough.

2. **Controller dependencies drive module configuration:** Always ensure the parent module can provide all dependencies injected into its controllers.

3. **Refactoring requires runtime validation:** TypeScript compilation may pass even when NestJS DI will fail at startup. Always start the application after module changes.

4. **Build cache is not your friend:** Long-running dev servers can mask refactoring errors. Restart them after significant file moves.

5. **Pre-existing bugs surface during refactoring:** Module moves can expose latent DI issues that were previously masked (e.g., by a parent module re-exporting needed dependencies).
