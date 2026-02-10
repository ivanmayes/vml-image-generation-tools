import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompositionModule1739200000000 implements MigrationInterface {
	name = 'AddCompositionModule1739200000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 0. Create enum types
		await queryRunner.query(`
			CREATE TYPE "composition_version_status_enum" AS ENUM (
				'processing', 'success', 'failed'
			)
		`);

		// 1. Create compositions table
		await queryRunner.query(`
			CREATE TABLE "compositions" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"projectId" uuid,
				"organizationId" uuid NOT NULL,
				"createdBy" uuid,
				"name" varchar NOT NULL,
				"canvasWidth" int NOT NULL DEFAULT 1024,
				"canvasHeight" int NOT NULL DEFAULT 1024,
				"canvasState" jsonb,
				"thumbnailS3Key" varchar,
				"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
				"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
				"deletedAt" TIMESTAMPTZ,
				CONSTRAINT "PK_compositions" PRIMARY KEY ("id")
			)
		`);

		// 2. Create composition_versions table
		await queryRunner.query(`
			CREATE TABLE "composition_versions" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"compositionId" uuid,
				"createdBy" uuid,
				"baseImageS3Key" varchar,
				"canvasStateSnapshot" jsonb,
				"prompt" text,
				"versionNumber" int NOT NULL,
				"imageWidth" int,
				"imageHeight" int,
				"status" "composition_version_status_enum" NOT NULL DEFAULT 'processing',
				"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
				CONSTRAINT "PK_composition_versions" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_composition_versions_composition_version" UNIQUE ("compositionId", "versionNumber")
			)
		`);

		// 3. Add FK constraints
		await queryRunner.query(`
			ALTER TABLE "compositions"
				ADD CONSTRAINT "FK_compositions_projectId"
				FOREIGN KEY ("projectId") REFERENCES "projects"("id")
				ON DELETE SET NULL
		`);

		await queryRunner.query(`
			ALTER TABLE "composition_versions"
				ADD CONSTRAINT "FK_composition_versions_compositionId"
				FOREIGN KEY ("compositionId") REFERENCES "compositions"("id")
				ON DELETE CASCADE
		`);

		// 4. Add indexes
		await queryRunner.query(
			`CREATE INDEX "IDX_compositions_organizationId" ON "compositions" ("organizationId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_compositions_projectId" ON "compositions" ("projectId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_compositions_org_project" ON "compositions" ("organizationId", "projectId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_compositions_org_deleted" ON "compositions" ("organizationId", "deletedAt")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_composition_versions_compositionId" ON "composition_versions" ("compositionId")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop indexes
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_composition_versions_compositionId"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_compositions_org_deleted"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_compositions_org_project"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_compositions_projectId"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_compositions_organizationId"`,
		);

		// Drop FK constraints
		await queryRunner.query(
			`ALTER TABLE "composition_versions" DROP CONSTRAINT IF EXISTS "FK_composition_versions_compositionId"`,
		);
		await queryRunner.query(
			`ALTER TABLE "compositions" DROP CONSTRAINT IF EXISTS "FK_compositions_projectId"`,
		);

		// Drop tables (versions first due to FK)
		await queryRunner.query(`DROP TABLE IF EXISTS "composition_versions"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "compositions"`);

		// Drop enum types
		await queryRunner.query(
			`DROP TYPE IF EXISTS "composition_version_status_enum"`,
		);
	}
}
