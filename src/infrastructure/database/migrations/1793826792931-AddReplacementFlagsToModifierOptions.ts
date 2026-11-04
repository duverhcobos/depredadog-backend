import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReplacementFlagsToModifierOptions1793826792931 implements MigrationInterface {
  name = 'AddReplacementFlagsToModifierOptions1793826792931';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "modifier_options"
        ADD COLUMN "is_replaceable" boolean NOT NULL DEFAULT true,
        ADD COLUMN "is_replacement_eligible" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "modifier_options"
        DROP COLUMN "is_replacement_eligible",
        DROP COLUMN "is_replaceable"
    `);
  }
}
