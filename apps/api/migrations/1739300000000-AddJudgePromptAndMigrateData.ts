import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJudgePromptAndMigrateData1739300000000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		// Add the nullable judgePrompt column
		await queryRunner.query(`
			ALTER TABLE "image_generation_agents"
			ADD COLUMN "judgePrompt" text
		`);

		// Migrate existing agents: extract OUTPUT FORMAT block from systemPrompt into judgePrompt.
		// Matches headings like "## OUTPUT FORMAT", "## REQUIRED OUTPUT FORMAT", "## REQUIRED OUTPUT FORMAT (JSON)", etc.
		// Everything from the heading to the end of systemPrompt is moved to judgePrompt.
		//
		// COALESCE guards against the edge case where the OUTPUT FORMAT heading is at the very
		// start of systemPrompt (no preceding newline). In that case the trim regex returns NULL
		// because it requires a \n before the heading. Without COALESCE, systemPrompt would be
		// set to NULL, violating its NOT NULL constraint and crashing the migration.
		//
		// regexp_replace with '\s+$' is used instead of rtrim() because rtrim() only removes
		// trailing spaces (ASCII 32), NOT newlines. Since the split regex consumes only one \n
		// before the heading, the captured prefix retains one trailing newline that must be
		// stripped to keep systemPrompt clean and make the DOWN migration perfectly reversible.
		await queryRunner.query(`
			UPDATE "image_generation_agents"
			SET
				"judgePrompt" = substring("systemPrompt" from '(##\\s+(?:REQUIRED\\s+)?OUTPUT FORMAT[^\\n]*(?:\\n[\\s\\S]*)?)$'),
				"systemPrompt" = COALESCE(
					regexp_replace(
						substring("systemPrompt" from '^([\\s\\S]*?)\\n##\\s+(?:REQUIRED\\s+)?OUTPUT FORMAT'),
						'\\s+$', ''
					),
					''
				)
			WHERE "systemPrompt" LIKE '%## OUTPUT FORMAT%'
			   OR "systemPrompt" LIKE '%## REQUIRED OUTPUT FORMAT%'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Merge judgePrompt back into systemPrompt for agents that had it extracted.
		// Uses CASE to avoid prepending "\n\n" when systemPrompt is empty (which happens
		// when the entire original prompt was the OUTPUT FORMAT block).
		await queryRunner.query(`
			UPDATE "image_generation_agents"
			SET "systemPrompt" = CASE
				WHEN "systemPrompt" = '' THEN "judgePrompt"
				ELSE "systemPrompt" || E'\\n\\n' || "judgePrompt"
			END
			WHERE "judgePrompt" IS NOT NULL
		`);

		await queryRunner.query(`
			ALTER TABLE "image_generation_agents"
			DROP COLUMN "judgePrompt"
		`);
	}
}
