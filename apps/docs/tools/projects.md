# Projects

Projects provide organizational structure for generation requests. They group related requests together, making it easier to manage campaigns, clients, or themes.

## What is a Project?

A project is a container for generation requests. Think of it as a folder:

```
Project: "Q4 Holiday Campaign"
├── Request: "Hero banner - desktop"
├── Request: "Hero banner - mobile"
├── Request: "Social media - Instagram"
├── Request: "Social media - Facebook"
└── Request: "Email header"
```

## Project Entity

**Source:** `apps/api/src/project/project.entity.ts`

| Field            | Type             | Description               |
| ---------------- | ---------------- | ------------------------- |
| `id`             | UUID             | Primary key               |
| `organizationId` | UUID             | Owning organization       |
| `spaceId`        | UUID (optional)  | Space for access control  |
| `name`           | string           | Project name              |
| `description`    | text (optional)  | Project description       |
| `settings`       | JSONB (optional) | Flexible settings storage |
| `createdAt`      | timestamp        | Creation date             |

## Pages

### Project List

**Route:** `/projects`

Displays all projects for the current organization in a list/grid view. Shows project name, description, request count, and creation date.

### Project Detail

**Route:** `/projects/:id`

Shows project details and all generation requests within the project. Allows editing the project name and description.

### Create Project Dialog

A modal dialog for creating new projects, with fields for name, description, and space assignment.

## API Endpoints

Base path: `/organization/:orgId/projects`

| Method        | Path               | Description                               |
| ------------- | ------------------ | ----------------------------------------- |
| `GET /`       | List all projects  | Returns projects for the organization     |
| `GET /:id`    | Get project detail | Returns a single project                  |
| `POST /`      | Create project     | Creates a new project                     |
| `PUT /:id`    | Update project     | Updates project name/description/settings |
| `DELETE /:id` | Delete project     | Removes the project                       |

### Create Project Example

```json
POST /organization/{orgId}/projects
{
  "name": "Q4 Holiday Campaign",
  "description": "Product photography for the holiday season",
  "spaceId": "uuid-space"
}
```

## Associating Requests with Projects

When creating a generation request, you can optionally set the `projectId` field to associate it with a project:

```json
POST /organization/{orgId}/image-generation/requests
{
  "brief": "A festive product shot...",
  "projectId": "uuid-project",
  "judgeIds": ["uuid-1"]
}
```

The generation list page supports filtering by project, so you can see all requests within a specific project.

## Space Integration

Projects can optionally belong to a space. When a project has a `spaceId`, access control follows the space's visibility and membership rules. If no space is assigned, the project is visible to all organization members with appropriate roles.
