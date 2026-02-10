# VML Image Generation Tools

Monorepo: NestJS 11.x API + Angular 20+ web app with PrimeNG v20+.

| Layer    | Stack                                           |
| -------- | ----------------------------------------------- |
| Frontend | Angular 20+, PrimeNG v20+, SCSS, Tailwind 4     |
| Backend  | NestJS 11.x, TypeORM, PostgreSQL                |
| Linting  | ESLint (flat config), Stylelint, custom plugins |

## Commands (run from root)

```bash
npm start          # Start API (port 8002) + Web (port 4200) with hot reload
npm run validate   # Lint + typecheck
npm run test       # Run tests
npm run api:manifest  # Regenerate OpenAPI manifest
```

## Rules

1. **Never `--no-verify`** without asking the user first. Fix hook failures instead of bypassing.
2. **Never duplicate API types in web.** Import from `@api/[module]/dtos`, `@api/[module]/[module].entity`, or `@api/[module]/[enum].enum`.
3. **Read [`PRD_DEFAULTS.md`](./PRD_DEFAULTS.md)** before planning new features.
4. **Styling reference**: [`tools/lint-plugins/PRIMENG_GUIDELINES.md`](./tools/lint-plugins/PRIMENG_GUIDELINES.md)
