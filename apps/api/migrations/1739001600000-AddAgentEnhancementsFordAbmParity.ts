import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentEnhancementsFordAbmParity1739001600000 implements MigrationInterface {
	name = 'AddAgentEnhancementsFordAbmParity1739001600000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Create enum types
		await queryRunner.query(`
			CREATE TYPE "agent_type_enum" AS ENUM ('EXPERT', 'AUDIENCE')
		`);

		await queryRunner.query(`
			CREATE TYPE "model_tier_enum" AS ENUM ('PRO', 'FLASH')
		`);

		await queryRunner.query(`
			CREATE TYPE "thinking_level_enum" AS ENUM ('LOW', 'MEDIUM', 'HIGH')
		`);

		await queryRunner.query(`
			CREATE TYPE "agent_status_enum" AS ENUM ('ACTIVE', 'INACTIVE')
		`);

		// Add new columns to image_generation_agents
		await queryRunner.query(`
			ALTER TABLE "image_generation_agents"
				ADD COLUMN "canJudge" boolean NOT NULL DEFAULT true,
				ADD COLUMN "description" text,
				ADD COLUMN "teamPrompt" text,
				ADD COLUMN "aiSummary" text,
				ADD COLUMN "agentType" "agent_type_enum",
				ADD COLUMN "modelTier" "model_tier_enum",
				ADD COLUMN "thinkingLevel" "thinking_level_enum",
				ADD COLUMN "status" "agent_status_enum" NOT NULL DEFAULT 'ACTIVE',
				ADD COLUMN "capabilities" jsonb NOT NULL DEFAULT '[]',
				ADD COLUMN "teamAgentIds" uuid[] NOT NULL DEFAULT '{}',
				ADD COLUMN "temperature" float,
				ADD COLUMN "maxTokens" integer,
				ADD COLUMN "avatarUrl" text,
				ADD COLUMN "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
		`);

		// Add new indexes
		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_agents_status" ON "image_generation_agents" ("status")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_agents_organizationId_status" ON "image_generation_agents" ("organizationId", "status")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop indexes
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_image_generation_agents_organizationId_status"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_image_generation_agents_status"`,
		);

		// Drop new columns
		await queryRunner.query(`
			ALTER TABLE "image_generation_agents"
				DROP COLUMN IF EXISTS "updatedAt",
				DROP COLUMN IF EXISTS "avatarUrl",
				DROP COLUMN IF EXISTS "maxTokens",
				DROP COLUMN IF EXISTS "temperature",
				DROP COLUMN IF EXISTS "teamAgentIds",
				DROP COLUMN IF EXISTS "capabilities",
				DROP COLUMN IF EXISTS "status",
				DROP COLUMN IF EXISTS "thinkingLevel",
				DROP COLUMN IF EXISTS "modelTier",
				DROP COLUMN IF EXISTS "agentType",
				DROP COLUMN IF EXISTS "aiSummary",
				DROP COLUMN IF EXISTS "teamPrompt",
				DROP COLUMN IF EXISTS "description",
				DROP COLUMN IF EXISTS "canJudge"
		`);

		// Drop enum types
		await queryRunner.query(`DROP TYPE IF EXISTS "agent_status_enum"`);
		await queryRunner.query(`DROP TYPE IF EXISTS "thinking_level_enum"`);
		await queryRunner.query(`DROP TYPE IF EXISTS "model_tier_enum"`);
		await queryRunner.query(`DROP TYPE IF EXISTS "agent_type_enum"`);
	}
}
