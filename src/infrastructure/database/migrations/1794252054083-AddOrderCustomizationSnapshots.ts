import { MigrationInterface, QueryRunner } from 'typeorm';

// Snapshots de fidelidad de personalización (§016): el detalle del
// pedido reproduce la personalización del carrito — foto por slug,
// "Lleva:" efectivo, secciones por grupo y reemplazos emparejados.
// NULL/'{}' en filas viejas = degradación honesta; el backfill de
// product_slug es un join inequívoco (product_id nunca cambia).
export class AddOrderCustomizationSnapshots1794252054083
    implements MigrationInterface {
    name = 'AddOrderCustomizationSnapshots1794252054083';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order_items"
         ADD COLUMN "product_slug" varchar(120) NULL,
         ADD COLUMN "included_names" text[] NOT NULL DEFAULT '{}'`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_item_modifiers"
         ADD COLUMN "modifier_group" varchar(50) NULL,
         ADD COLUMN "replaces_option_id" uuid NULL
           REFERENCES "modifier_options"("id")`,
        );
        await queryRunner.query(
            `CREATE INDEX "idx_oim_replaces_option"
         ON "order_item_modifiers" ("replaces_option_id")`,
        );
        await queryRunner.query(
            `UPDATE "order_items" oi SET "product_slug" = p."slug"
       FROM "products" p WHERE p."id" = oi."product_id"`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "idx_oim_replaces_option"`);
        await queryRunner.query(
            `ALTER TABLE "order_item_modifiers"
         DROP COLUMN "replaces_option_id",
         DROP COLUMN "modifier_group"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_items"
         DROP COLUMN "included_names",
         DROP COLUMN "product_slug"`,
        );
    }
}
