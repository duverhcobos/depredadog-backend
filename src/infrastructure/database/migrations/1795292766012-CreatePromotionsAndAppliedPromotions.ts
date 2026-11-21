import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

// Motor de promociones/combos (§027): la carta del dueño modela
// ofertas como REGLAS sobre el contenido del pedido, no como ítems
// vendibles — la tabla `promotions` las define (config jsonb por kind)
// y `orders.applied_promotions` guarda el snapshot de lo aplicado
// (sobrevive a desactivar la promo después, como los demás snapshots
// del módulo). `orders.discount` ya existía desde la creación de la
// tabla — esta migración solo le da uso.
export class CreatePromotionsAndAppliedPromotions1795292766012 implements MigrationInterface {
  name = 'CreatePromotionsAndAppliedPromotions1795292766012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "promotion_kind" AS ENUM ('fixed_bundle', 'free_item', 'percent_off', 'showcase')`,
    );

    // Una fila por oferta del rail de Combos: fixed_bundle (precio
    // cerrado por set), free_item (regalo por umbral de elegibles),
    // percent_off (−N% sobre líneas elegibles) y showcase (card
    // presentacional que no evalúa — la cubre otra promo real).
    await queryRunner.query(`
      CREATE TABLE "promotions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(60) NOT NULL,
        "name" varchar(120) NOT NULL,
        "tagline" varchar(200),
        "kind" promotion_kind NOT NULL,
        "config" jsonb NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_promotions_slug" UNIQUE ("slug")
      )
    `);
    // El rail y el motor leen activas por sort_order — índice parcial
    // para el único query que existe.
    await queryRunner.query(
      `CREATE INDEX "idx_promotions_active_sort" ON "promotions" ("sort_order") WHERE "is_active"`,
    );

    // Snapshot [{slug, name, saving}] de las promos que descontaron el
    // pedido — NULL en pedidos viejos (backward compat: la respuesta
    // los devuelve como []).
    await queryRunner.addColumn(
      'orders',
      new TableColumn({
        name: 'applied_promotions',
        type: 'jsonb',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('orders', 'applied_promotions');
    await queryRunner.query(`DROP TABLE "promotions"`);
    await queryRunner.query(`DROP TYPE "promotion_kind"`);
  }
}
