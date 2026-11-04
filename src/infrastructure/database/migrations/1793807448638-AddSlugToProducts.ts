import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSlugToProducts1793807448638 implements MigrationInterface {
  name = 'AddSlugToProducts1793807448638';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products" ADD COLUMN "slug" varchar(120) NOT NULL DEFAULT ''
    `);
    // Placeholder técnico único para filas ya sembradas (permite crear el
    // índice único; el seed pisa con el slug real). NO es dato de negocio.
    await queryRunner.query(`
      UPDATE "products" SET "slug" = 'product-' || "id" WHERE "slug" = ''
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_products_slug" ON "products" ("slug")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_products_slug"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "slug"`);
  }
}
