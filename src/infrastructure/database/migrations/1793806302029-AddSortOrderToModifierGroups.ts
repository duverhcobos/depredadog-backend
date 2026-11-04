import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSortOrderToModifierGroups1793806302029 implements MigrationInterface {
  name = 'AddSortOrderToModifierGroups1793806302029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "modifier_groups" ADD COLUMN "sort_order" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "modifier_groups" DROP COLUMN "sort_order"
    `);
  }
}
