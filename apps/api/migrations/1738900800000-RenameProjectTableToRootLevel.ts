import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameProjectTableToRootLevel1738900800000 implements MigrationInterface {
	name = 'RenameProjectTableToRootLevel1738900800000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "image_generation_projects" RENAME TO "projects"`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "projects" RENAME TO "image_generation_projects"`,
		);
	}
}
