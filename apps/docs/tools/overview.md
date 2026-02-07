# Tools Overview

The platform provides several specialized tools accessible from the home page. Each tool serves a different purpose in the image generation and compliance workflow. The tools are registered in a central **Tool Registry** and displayed as a grid on the home page.

## Available Tools

### Iterative Image Generation

**Route:** `/iterative-image-generation`

The core tool. Creates AI-generated images through an iterative refinement loop with judge evaluation and prompt optimization. Covered in detail in the [Image Generation System](../image-generation/overview.md) section.

### Compliance Checker

**Route:** `/compliance`

Bulk image evaluation tool for checking existing images against brand guidelines or quality standards without running the full generation pipeline. See [Compliance Tool](compliance.md).

### Projects

**Route:** `/projects`

Project management for organizing generation requests into logical groups. See [Projects](projects.md).

## Tool Registry

**Source:** `apps/web/src/app/shared/tools/tool-registry.ts`

The tool registry is a centralized list of all available tools with metadata for the home page grid:

```typescript
interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  icon: string; // PrimeNG icon name
  route: string; // Angular route path
  category: string; // Tool category for grouping
  enabled: boolean; // Whether the tool is available
}
```

### Adding a New Tool

To add a new tool to the platform:

1. **Create the page** — Add a new page module under `apps/web/src/app/pages/`
2. **Add routing** — Register the route in `app.routes.ts`
3. **Register in tool registry** — Add a `ToolDefinition` entry in `tool-registry.ts`
4. **The tool automatically appears** on the home page grid

## Home Page

**Route:** `/home`

The home page displays the tool registry as a **ToolboxGridComponent** — a card grid where each card represents one tool. Clicking a card navigates to the tool's route.

The home page serves as the central launcher for all platform tools, similar to a dashboard with quick-access cards.
