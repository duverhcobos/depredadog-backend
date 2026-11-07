import { MigrationInterface, QueryRunner } from 'typeorm';

export class EvolveAddressesToLandmark1794056030249 implements MigrationInterface {
  name = 'EvolveAddressesToLandmark1794056030249';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "address_type" AS ENUM ('home','work','other')`,
    );
    // §022a — la zona no tiene nomenclatura: la "dirección" ES el
    // punto de referencia; el sector va en neighborhood.
    await queryRunner.query(
      `ALTER TABLE "addresses" RENAME COLUMN "address_line" TO "landmark"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" RENAME COLUMN "reference" TO "neighborhood"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" ADD COLUMN "type" "address_type" NOT NULL DEFAULT 'other'`,
    );
    // §014 — borrar una dirección NO tira el pedido: la orden ya
    // guarda delivery_address como snapshot; el link solo era
    // procedencia (misma filosofía que order_item_modifiers.option_id).
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "orders_address_id_fkey"`,
    );
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "orders_address_id_fkey"
      FOREIGN KEY ("address_id") REFERENCES "addresses"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "orders_address_id_fkey"`,
    );
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "orders_address_id_fkey"
      FOREIGN KEY ("address_id") REFERENCES "addresses"("id")
    `);
    await queryRunner.query(`ALTER TABLE "addresses" DROP COLUMN "type"`);
    await queryRunner.query(
      `ALTER TABLE "addresses" RENAME COLUMN "neighborhood" TO "reference"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" RENAME COLUMN "landmark" TO "address_line"`,
    );
    await queryRunner.query(`DROP TYPE "address_type"`);
  }
}
