---
title: "feat: Add Agent Ownership, My Agents Sidebar & User-Based Filtering"
type: feat
date: 2026-02-09
revised: true
---

# feat: Add Agent Ownership, My Agents Sidebar & User-Based Filtering

## Overview

Add a "My Agents" sidebar tab visible to all authenticated users, with a dedicated page (duplicated from the admin judges page) showing only agents owned by the current user. Amend CRUD permissions so agent owners (not just admins) can create, edit, delete, and manage documents on their own agents. The admin section remains unchanged for full org-wide agent management.

> **Design decision**: The My Agents page and detail page are **duplicates** of the admin judges pages, not shared/parameterized components. Admin and user pages serve different audiences and will diverge over time (bulk operations, status overrides, orphan agent visibility). A 160-line page copied is simpler than a 250-line page parameterized.

> **Scope note**: Tool dropdown filtering (Image Evaluator, Compliance, Generation) is **out of scope** for this feature. The backend `GET /agents` endpoint already filters by `userContext` when the role is non-admin, so tool dropdowns will automatically show only the user's own agents with zero frontend changes. Verify this during implementation; do not write filtering code unless verification fails.

## Problem Statement / Motivation

Currently, agents are managed exclusively through the admin panel (`/organization/admin/judges`), which is restricted to Admin and SuperAdmin roles. While the backend already has `createdBy` tracking and non-admin filtering in `findByOrganization()`, the frontend has no way for regular users to access or manage their own agents. This limits self-service for Manager and User roles and creates unnecessary admin bottlenecks.

## Proposed Solution

### Backend Changes

1. **Relax `@Roles` decorators** on 5 endpoints to allow Manager/User for their own agents
2. **Add ownership verification** via `userContext` on update, delete, and document endpoints (follow the pattern in `getAgent()` at line 170)
3. **Add `teamAgentIds` ownership validation** when non-admins create/update agents
4. **Keep admin section unchanged** — admins bypass ownership checks

### Frontend Changes

1. **Add "My Agents" to sidebar** — static nav item in `SidebarService` (no role-based visibility; API handles auth)
2. **Create "My Agents" page** — duplicate of judges page with own routes (`/my-agents`, `/my-agents/new`, `/my-agents/:id`)
3. **Create "My Agents" detail page** — duplicate of judge-detail page with back-route pointing to `/my-agents`

## Technical Considerations

### Architecture

- **Backend filtering already exists**: `agent.service.ts:findByOrganization()` (lines 146-199) filters by `createdBy` for non-admin `userContext`
- **Ownership check pattern**: Pass `userContext` to `getWithDocuments()` (lines 217-236) which already adds `createdBy = userId` for non-admins. Follow the exact pattern in `getAgent()` (lines 170-201).
- **Page duplication**: Create `apps/web/src/app/pages/my-agents/` with independent list + detail components. They import the same AgentService, PrimeNG modules, and form controls, but own their own routes and navigation.

### Security

- **CRITICAL**: `updateAgent` (line 310) and `deleteAgent` (line 414) call `getWithDocuments(id, orgId)` WITHOUT `userContext` (lines 327, 430). Must add `userContext` parameter so the service enforces ownership for non-admins.
- **CRITICAL**: `teamAgentIds` ownership — when non-admins create/update agents with `teamAgentIds`, each referenced agent must belong to the requesting user. Currently only cycle validation exists (`TeamCycleValidator` at lines 234-237 for create, 343-346 for update). Add inline ownership check: fetch agents by those IDs with `userContext` scoping and verify the returned count matches the requested count. Do this in the controller, not in a new service.
- **Document endpoints** (`getDocuments` line 470, `uploadDocument` line 530, `deleteDocument` line 650) use `findOne({ where: { id, organizationId } })` which does NOT filter by `createdBy`. Must replace with `getWithDocuments()` + `userContext` when widening to non-admins.
- **Legacy agents** (`createdBy: null`) are invisible to non-admins because `createdBy = userId` never matches NULL. No special handling needed.

### Data Considerations

- Legacy agents with `createdBy: null` stay admin-only (no migration needed)
- `onDelete: 'SET NULL'` on creator relationship means deleted users' agents become admin-only orphans

## Acceptance Criteria

### Backend — Authorization

- [ ] `PUT /agents/:id` (line 308) allows Manager and User roles when `createdBy` matches the requesting user
- [ ] `DELETE /agents/:id` (line 412) allows Manager and User roles when `createdBy` matches the requesting user
- [ ] `GET /agents/:id/documents` (line 468) allows Manager and User roles when agent's `createdBy` matches
- [ ] `POST /agents/:id/documents` (line 527) allows Manager and User roles when agent's `createdBy` matches
- [ ] `DELETE /agents/:id/documents/:documentId` (line 648) allows Manager and User roles when agent's `createdBy` matches
- [ ] Admin and SuperAdmin roles continue to edit/delete any agent (no ownership check)
- [ ] `userContext` is passed to `getWithDocuments()` in update (line 327) and delete (line 430) controller methods
- [ ] Document endpoints replace `findOne` with `getWithDocuments()` + `userContext` for ownership enforcement
- [ ] Non-admin users cannot reference agents they don't own in `teamAgentIds` — validate by fetching referenced IDs with `userContext` scoping and comparing count
- [ ] Agents with `createdBy: null` are NOT returned for non-admin users (existing behavior, verify)
- [ ] `POST /agents/:id/restore` (line 773) remains admin-only (explicit decision)
- [ ] Export/import endpoints (lines 816, 886, 957) remain admin-only (explicit decision)
- [ ] `GET /agents/:id/with-team` (line 734) already allows Manager/User with `userContext` — no changes needed (verified)

### Backend — API Filtering

- [ ] `GET /agents` returns only user's own agents when `userContext.role` is not admin (existing behavior, verify)
- [ ] `POST /agents` sets `createdBy` to requesting user's ID (existing behavior at line 251, verify)

### Frontend — Sidebar & Navigation

- [ ] "My Agents" nav item added statically to `SidebarService` initial array (visible to all authenticated users)
- [ ] "My Agents" nav item uses an appropriate icon (e.g., `pi-objects-column` or `pi-microchip-ai`)
- [ ] Clicking "My Agents" navigates to `/my-agents`
- [ ] Route `/my-agents` is defined in `app.routes.ts` (no `AdminRoleGuard` — API handles auth)

### Frontend — My Agents Page (Duplicate of Judges Page)

- [ ] New component at `apps/web/src/app/pages/my-agents/my-agents.page.ts` — independent copy of judges page
- [ ] Page loads and displays only agents where `createdBy` matches the current user (backend handles filtering)
- [ ] Table shows columns: Name, Status, Type, Can Judge, Model, Created, Actions
- [ ] Search/filter by name works
- [ ] Sort by name/createdAt/updatedAt/status works
- [ ] Create agent button navigates to `/my-agents/new`
- [ ] Edit navigates to `/my-agents/:id`
- [ ] Delete shows confirmation dialog and deletes on confirm
- [ ] Empty state shows "No agents yet. Create your first agent." message

### Frontend — My Agents Detail Page (Duplicate of Judge Detail)

- [ ] New component at `apps/web/src/app/pages/my-agents/my-agent-detail/my-agent-detail.page.ts`
- [ ] Back/cancel navigates to `/my-agents`
- [ ] Create and edit flows work identically to the admin judge-detail page
- [ ] `loadAvailableAgents` for team picker returns only user's own agents (backend handles filtering)
- [ ] Direct URL access to an agent the user does not own shows a 404/error state (backend returns null)

### Admin Section

- [ ] Admin judges page (`/organization/admin/judges`) continues to show ALL agents — no changes
- [ ] Admin CRUD operations are unaffected
- [ ] Admins can still manage agents with `createdBy: null`

## Success Metrics

- Non-admin users (Manager, User) can create, view, edit, and delete their own agents without admin intervention
- Admin workflow for managing all agents is unchanged
- No authorization bypass — non-admins cannot access or modify other users' agents

## Dependencies & Risks

### Dependencies

- Agent entity `createdBy` field already exists (no migration needed)
- Backend filtering in `findByOrganization()` already works for non-admin users
- `SidebarService` supports static nav items

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Legacy null-createdBy agents confuse admins | Low | Low | Document as "unowned" agents, visible only in admin |
| `teamAgentIds` ownership bypass via crafted API request | Medium | High | Validate referenced IDs against `userContext` in controller |

## Implementation Plan

### Step 1: Backend Auth Changes (~20 lines in `agent.controller.ts`)

1. Widen `@Roles` on `updateAgent` (line 308), `deleteAgent` (line 412), `getDocuments` (line 468), `uploadDocument` (line 527), `deleteDocument` (line 648) to include `Manager` and `User`
2. Build `userContext` from `req.user` in each of these methods (copy pattern from `getAgent` lines 176-180)
3. Pass `userContext` to `getWithDocuments()` in update and delete handlers
4. Replace `findOne` with `getWithDocuments()` + `userContext` in document endpoints
5. Add `teamAgentIds` ownership check: when `teamAgentIds` is provided by a non-admin, fetch those agents with `userContext` scoping and verify count matches

### Step 2: Frontend — Route, Sidebar, Pages

1. Add `/my-agents` route in `app.routes.ts` (no `AdminRoleGuard`)
2. Add "My Agents" static nav item to `SidebarService`
3. Create `apps/web/src/app/pages/my-agents/my-agents.page.ts` — copy from judges page, change routes to `/my-agents/*`
4. Create `apps/web/src/app/pages/my-agents/my-agent-detail/my-agent-detail.page.ts` — copy from judge-detail page, change back-route to `/my-agents`
5. Wire up routing module for `my-agents` page and detail

### Key Files

**Backend (modify):**

| File | Change |
|------|--------|
| `apps/api/src/agent/agent.controller.ts` | Widen `@Roles` on 5 endpoints, add `userContext` to update/delete/document methods, add `teamAgentIds` ownership check |

**Frontend (modify):**

| File | Change |
|------|--------|
| `apps/web/src/app/shared/services/sidebar.service.ts` | Add "My Agents" static nav item |
| `apps/web/src/app/app.routes.ts` | Add `/my-agents` route (no admin guard) |

**Frontend (new):**

| File | Description |
|------|-------------|
| `apps/web/src/app/pages/my-agents/my-agents.page.ts` | My Agents list page (duplicate of judges page) |
| `apps/web/src/app/pages/my-agents/my-agents.page.html` | My Agents list template |
| `apps/web/src/app/pages/my-agents/my-agents.page.scss` | My Agents list styles |
| `apps/web/src/app/pages/my-agents/my-agents.module.ts` | My Agents module with routing |
| `apps/web/src/app/pages/my-agents/my-agent-detail/my-agent-detail.page.ts` | Agent detail page (duplicate of judge-detail) |
| `apps/web/src/app/pages/my-agents/my-agent-detail/my-agent-detail.page.html` | Agent detail template |
| `apps/web/src/app/pages/my-agents/my-agent-detail/my-agent-detail.page.scss` | Agent detail styles |

**No changes needed (verified):**

| File | Reason |
|------|--------|
| `apps/api/src/agent/agent.service.ts` | Ownership filtering already works via `userContext` parameter |
| `apps/api/src/agent/dtos/agent-update.dto.ts` | `createdBy` is write-once, no DTO changes needed |
| `apps/web/src/app/shared/components/image-evaluator/image-evaluator.component.ts` | Backend already filters by `userContext` |
| `apps/web/src/app/pages/compliance/compliance.page.ts` | Backend already filters by `userContext` |
| `apps/web/src/app/shared/guards/admin-role.guard.ts` | Not used on `/my-agents` route |
| `GET /agents/:id/with-team` (line 734) | Already allows Manager/User with `userContext` |

## References

- Agent entity: `apps/api/src/agent/agent.entity.ts` (createdBy at line 171)
- Agent service filtering: `apps/api/src/agent/agent.service.ts` (findByOrganization lines 146-199, getWithDocuments lines 217-236)
- Agent controller: `apps/api/src/agent/agent.controller.ts` (key endpoints: update line 310, delete line 414, documents lines 470/530/650)
- Sidebar service: `apps/web/src/app/shared/services/sidebar.service.ts`
- Judges page: `apps/web/src/app/pages/organization-admin/judges/judges.page.ts`
- Judge detail: `apps/web/src/app/pages/organization-admin/judges/judge-detail/judge-detail.page.ts`
- User context interface: `apps/api/src/_core/interfaces/user-context.interface.ts` (isAdminRole helper)
- Team cycle validator: `apps/api/src/agent/validators/team-cycle.validator.ts`
