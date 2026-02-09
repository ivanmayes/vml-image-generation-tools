import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatedByUserScoping1739088000000 implements MigrationInterface {
	name = 'AddCreatedByUserScoping1739088000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1. Add nullable createdBy columns
		await queryRunner.query(`
			ALTER TABLE "projects"
				ADD COLUMN "createdBy" uuid
		`);

		await queryRunner.query(`
			ALTER TABLE "image_generation_requests"
				ADD COLUMN "createdBy" uuid
		`);

		await queryRunner.query(`
			ALTER TABLE "image_generation_agents"
				ADD COLUMN "createdBy" uuid
		`);

		// 2. Backfill existing records using first admin user per org
		await queryRunner.query(`
			UPDATE "projects" p
			SET "createdBy" = (
				SELECT u.id FROM "users" u
				WHERE u."organizationId" = p."organizationId"
				ORDER BY
					CASE u."role"
						WHEN 'admin' THEN 1
						WHEN 'super-admin' THEN 2
						ELSE 3
					END,
					u."created" ASC
				LIMIT 1
			)
			WHERE p."createdBy" IS NULL
		`);

		await queryRunner.query(`
			UPDATE "image_generation_requests" r
			SET "createdBy" = (
				SELECT u.id FROM "users" u
				WHERE u."organizationId" = r."organizationId"
				ORDER BY
					CASE u."role"
						WHEN 'admin' THEN 1
						WHEN 'super-admin' THEN 2
						ELSE 3
					END,
					u."created" ASC
				LIMIT 1
			)
			WHERE r."createdBy" IS NULL
		`);

		await queryRunner.query(`
			UPDATE "image_generation_agents" a
			SET "createdBy" = (
				SELECT u.id FROM "users" u
				WHERE u."organizationId" = a."organizationId"
				ORDER BY
					CASE u."role"
						WHEN 'admin' THEN 1
						WHEN 'super-admin' THEN 2
						ELSE 3
					END,
					u."created" ASC
				LIMIT 1
			)
			WHERE a."createdBy" IS NULL
		`);

		// 3. Add FK constraints
		await queryRunner.query(`
			ALTER TABLE "projects"
				ADD CONSTRAINT "FK_projects_createdBy"
				FOREIGN KEY ("createdBy") REFERENCES "users"("id")
				ON DELETE SET NULL
		`);

		await queryRunner.query(`
			ALTER TABLE "image_generation_requests"
				ADD CONSTRAINT "FK_image_generation_requests_createdBy"
				FOREIGN KEY ("createdBy") REFERENCES "users"("id")
				ON DELETE SET NULL
		`);

		await queryRunner.query(`
			ALTER TABLE "image_generation_agents"
				ADD CONSTRAINT "FK_image_generation_agents_createdBy"
				FOREIGN KEY ("createdBy") REFERENCES "users"("id")
				ON DELETE SET NULL
		`);

		// 4. Add composite indexes
		await queryRunner.query(
			`CREATE INDEX "IDX_projects_organizationId_createdBy" ON "projects" ("organizationId", "createdBy")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_requests_organizationId_createdBy" ON "image_generation_requests" ("organizationId", "createdBy")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_agents_organizationId_createdBy" ON "image_generation_agents" ("organizationId", "createdBy")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop indexes
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_image_generation_agents_organizationId_createdBy"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_image_generation_requests_organizationId_createdBy"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_projects_organizationId_createdBy"`,
		);

		// Drop FK constraints
		await queryRunner.query(
			`ALTER TABLE "image_generation_agents" DROP CONSTRAINT IF EXISTS "FK_image_generation_agents_createdBy"`,
		);
		await queryRunner.query(
			`ALTER TABLE "image_generation_requests" DROP CONSTRAINT IF EXISTS "FK_image_generation_requests_createdBy"`,
		);
		await queryRunner.query(
			`ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "FK_projects_createdBy"`,
		);

		// Drop columns
		await queryRunner.query(`
			ALTER TABLE "image_generation_agents" DROP COLUMN IF EXISTS "createdBy"
		`);
		await queryRunner.query(`
			ALTER TABLE "image_generation_requests" DROP COLUMN IF EXISTS "createdBy"
		`);
		await queryRunner.query(`
			ALTER TABLE "projects" DROP COLUMN IF EXISTS "createdBy"
		`);
	}
}
