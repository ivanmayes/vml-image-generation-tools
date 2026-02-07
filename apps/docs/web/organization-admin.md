# Organization Admin Pages

The organization admin section provides administrative tools for managing the organization's settings, users, spaces, and image generation judges. It's accessible at `/organization/admin` and requires the Admin or SuperAdmin role.

## Routes

| Route                            | Page         | Description                      |
| -------------------------------- | ------------ | -------------------------------- |
| `/organization/admin`            | Dashboard    | Organization overview            |
| `/organization/admin/settings`   | Settings     | Organization-wide configuration  |
| `/organization/admin/spaces`     | Spaces       | Manage spaces/workspaces         |
| `/organization/admin/users`      | Users        | Manage organization users        |
| `/organization/admin/judges`     | Judges       | Manage judge agents              |
| `/organization/admin/judges/:id` | Judge Detail | Configure a specific judge       |
| `/organization/admin/compliance` | Compliance   | Organization compliance settings |

## Settings Page

Organization-wide settings management. Edits are saved to the organization's `settings` JSONB field.

## Spaces Management

List and manage spaces within the organization:

- Create new spaces with the **SpaceFormDialogComponent**
- Edit space names, visibility (public/private), and settings
- View space membership

## Users Management

List and manage organization users:

- View all users with roles and activation status
- **InviteUserDialogComponent** — Send invitations to new users
- **PromoteUserDialogComponent** — Change user roles (User, Admin, SuperAdmin)
- Deactivate users (soft disable, not delete)

## Judges Page

Lists all judge agents in the organization. This is the primary place to create and manage the AI evaluators used in image generation.

### Judge Detail Page

**Source:** `apps/web/src/app/pages/organization-admin/judges/judge-detail/`

The most important admin page for the image generation system. Allows full configuration of a judge agent:

**System Prompt Editor:**

- Full-text editor for the agent's system prompt
- This is where you define the agent's evaluation personality and criteria
- If the prompt includes "OUTPUT FORMAT", it overrides the default evaluation response format

**Evaluation Categories:**

- Text field for defining category names the agent should score
- Categories appear in evaluation results as `categoryScores`

**Scoring Weight:**

- Slider (0–100) controlling how much this agent's score influences the aggregate
- Higher weight = more influence on the final score

**Optimization Weight:**

- Slider (0–100) controlling how much this agent's feedback influences prompt optimization
- Higher weight = more influence on the optimizer's decisions

**RAG Configuration:**

- `topK` — Number of document chunks to retrieve (default: 5)
- `similarityThreshold` — Minimum relevance score (default: 0.7)

**Document Management:**

- Upload reference documents (PDF, DOCX) for RAG context
- View uploaded documents with processing status
- Delete documents

The shared **ImageEvaluatorComponent** is integrated here, allowing admins to test a judge against sample images directly from the configuration page.

## Space Admin Pages

Accessible at `/space/:id/admin`, these pages manage individual spaces:

| Route                       | Page     | Description                  |
| --------------------------- | -------- | ---------------------------- |
| `/space/:id/admin/settings` | Settings | Space-specific configuration |
| `/space/:id/admin/users`    | Users    | Manage space membership      |

### Space User Management

- **InviteUserDialogComponent** — Add users to the space
- **ChangeRoleDialogComponent** — Update user roles within the space (Owner, Admin, Contributor, Viewer)
- Remove users from the space

## Access Control

- **AdminRoleGuard** — Protects all `/organization/admin` routes, requires Admin or SuperAdmin role
- **SpaceAdminGuard** — Protects `/space/:id/admin` routes, requires space admin role
- Guards check roles from the session store before allowing navigation
