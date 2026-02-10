# API Rules (NestJS + TypeORM)

## Entity Naming

- Class: PascalCase singular (`User`, `Organization`)
- Table: snake_case plural (`users`, `organizations`)
- DB column: snake_case (`created_at`, `organization_id`)
- Code property: camelCase (`createdAt`, `organizationId`)

## DTOs

Every endpoint needs a DTO with:

- `class-validator` decorators for validation
- `@ApiProperty` / `@ApiPropertyOptional` for Swagger

```typescript
export class CreateItemDto {
	@ApiProperty({ description: 'Item name', example: 'My Item' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(255)
	name: string;

	@ApiPropertyOptional({ description: 'Item description' })
	@IsString()
	@IsOptional()
	@MaxLength(2000)
	description?: string;
}
```

Never use an entity class directly as `@Body()`.

## Organization Scoping (Required)

All queries must be scoped to the user's organization:

```typescript
async findAll(organizationId: string): Promise<Item[]> {
  return this.itemRepo.find({ where: { organizationId } });
}
```

Unscoped queries are data leaks.

## Swagger Documentation

Every endpoint needs `@ApiOperation`, `@ApiResponse`, and `@ApiTags`. Every controller needs `@ApiTags('module-name')`.

## Database Migrations

- Generate: `npm run typeorm migration:generate -- -n MigrationName`
- Run: `npm run typeorm migration:run`
- Never use `synchronize: true` in production

## Error Handling

Use NestJS exceptions, not generic `Error` or `HttpException`:

```typescript
throw new NotFoundException(`Item ${id} not found`);
throw new BadRequestException('Invalid input');
throw new ForbiddenException('Access denied');
```

## Before Creating a New Endpoint

1. Check `api-manifest.json` at repo root for existing routes
2. Search controllers: `grep -r "@Get\|@Post\|@Put\|@Delete" apps/api/src`
3. Create DTOs in `[module]/dtos/` with validation + Swagger decorators
4. After creating: run `npm run api:manifest` to update the manifest

## Security

Never log passwords, API keys, or tokens.

## Pre-Commit Checklist

- [ ] `npm run lint` passes
- [ ] All endpoints have Swagger decorators
- [ ] All DTOs have validation decorators
- [ ] Queries are organization-scoped
- [ ] New entities have proper indexes
- [ ] API manifest updated (`npm run api:manifest`)
