import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectEntityAndScoping1738774800000 implements MigrationInterface {
	name = 'AddProjectEntityAndScoping1738774800000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1. Create image_generation_projects table
		await queryRunner.query(`
			CREATE TABLE "image_generation_projects" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"organizationId" uuid NOT NULL,
				"spaceId" uuid,
				"name" text NOT NULL,
				"description" text,
				"settings" jsonb NOT NULL DEFAULT '{}',
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"deletedAt" TIMESTAMP WITH TIME ZONE,
				CONSTRAINT "PK_image_generation_projects" PRIMARY KEY ("id"),
				CONSTRAINT "FK_image_generation_projects_organization" FOREIGN KEY ("organizationId")
					REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
				CONSTRAINT "FK_image_generation_projects_space" FOREIGN KEY ("spaceId")
					REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION
			)
		`);

		// Indexes on projects table
		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_projects_organizationId" ON "image_generation_projects" ("organizationId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_projects_organizationId_spaceId" ON "image_generation_projects" ("organizationId", "spaceId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_projects_organizationId_deletedAt" ON "image_generation_projects" ("organizationId", "deletedAt")`,
		);

		// 2. Add projectId column to image_generation_requests
		await queryRunner.query(
			`ALTER TABLE "image_generation_requests" ADD "projectId" uuid`,
		);
		await queryRunner.query(`
			ALTER TABLE "image_generation_requests"
			ADD CONSTRAINT "FK_image_generation_requests_project" FOREIGN KEY ("projectId")
				REFERENCES "image_generation_projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION
		`);

		// 3. Add spaceId column to image_generation_requests
		await queryRunner.query(
			`ALTER TABLE "image_generation_requests" ADD "spaceId" uuid`,
		);
		await queryRunner.query(`
			ALTER TABLE "image_generation_requests"
			ADD CONSTRAINT "FK_image_generation_requests_space" FOREIGN KEY ("spaceId")
				REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE NO ACTION
		`);

		// 4. Indexes on new request columns
		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_requests_organizationId_projectId" ON "image_generation_requests" ("organizationId", "projectId")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop indexes
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_image_generation_requests_organizationId_projectId"`,
		);

		// Drop FK constraints on requests
		await queryRunner.query(
			`ALTER TABLE "image_generation_requests" DROP CONSTRAINT IF EXISTS "FK_image_generation_requests_space"`,
		);
		await queryRunner.query(
			`ALTER TABLE "image_generation_requests" DROP CONSTRAINT IF EXISTS "FK_image_generation_requests_project"`,
		);

		// Drop columns on requests
		await queryRunner.query(
			`ALTER TABLE "image_generation_requests" DROP COLUMN IF EXISTS "spaceId"`,
		);
		await queryRunner.query(
			`ALTER TABLE "image_generation_requests" DROP COLUMN IF EXISTS "projectId"`,
		);

		// Drop projects indexes
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_image_generation_projects_organizationId_deletedAt"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_image_generation_projects_organizationId_spaceId"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_image_generation_projects_organizationId"`,
		);

		// Drop projects table
		await queryRunner.query(
			`DROP TABLE IF EXISTS "image_generation_projects"`,
		);
	}
}
