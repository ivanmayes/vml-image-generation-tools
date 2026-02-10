import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVersionErrorMessage1739300000001 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "composition_versions" ADD COLUMN IF NOT EXISTS "errorMessage" text`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "composition_versions" DROP COLUMN IF EXISTS "errorMessage"`,
		);
	}
}
