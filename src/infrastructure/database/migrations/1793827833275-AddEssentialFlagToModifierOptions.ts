import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEssentialFlagToModifierOptions1793827833275 implements MigrationInterface {
  name = 'AddEssentialFlagToModifierOptions1793827833275';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "modifier_options"
        ADD COLUMN "is_essential" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "modifier_options"
        DROP COLUMN "is_essential"
    `);
  }
}
