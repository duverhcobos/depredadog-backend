import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCatalogTables1793803996122 implements MigrationInterface {
  name = 'CreateCatalogTables1793803996122';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(100) NOT NULL,
        "slug" varchar(100) NOT NULL,
        "description" text,
        "image_url" varchar(500),
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_categories_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "category_id" uuid NOT NULL REFERENCES "categories"("id"),
        "name" varchar(150) NOT NULL,
        "description" text,
        "base_price" numeric(10,2) NOT NULL,
        "is_available" boolean NOT NULL DEFAULT true,
        "is_combo" boolean NOT NULL DEFAULT false,
        "is_featured" boolean NOT NULL DEFAULT false,
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_products_category_sort" ON "products" ("category_id", "sort_order")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_featured" ON "products" ("is_featured") WHERE "is_featured"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_available" ON "products" ("is_available")`,
    );

    await queryRunner.query(`
      CREATE TABLE "product_images" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "image_url" varchar(500) NOT NULL,
        "sort_order" int NOT NULL DEFAULT 0,
        "is_primary" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_product_images_product_sort" ON "product_images" ("product_id", "sort_order")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_product_images_primary" ON "product_images" ("product_id") WHERE "is_primary"`,
    );

    await queryRunner.query(`
      CREATE TABLE "combo_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "combo_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "item_product_id" uuid NOT NULL REFERENCES "products"("id"),
        "quantity" int NOT NULL DEFAULT 1,
        CONSTRAINT "uq_combo_items_pair" UNIQUE ("combo_id", "item_product_id")
      )
    `);

    // slug: clave estable para el consumidor ('ingredients', 'toppings',
    // 'sauces') — el name es display editable (evolución del modelo).
    await queryRunner.query(`
      CREATE TABLE "modifier_groups" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(50) NOT NULL,
        "name" varchar(100) NOT NULL,
        "min_select" int NOT NULL DEFAULT 0,
        "max_select" int,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_modifier_groups_slug" UNIQUE ("slug")
      )
    `);

    // included_by_default NO va aquí (evolución del modelo): "viene por
    // defecto" es por-producto → vive en product_modifier_options.
    await queryRunner.query(`
      CREATE TABLE "modifier_options" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL REFERENCES "modifier_groups"("id") ON DELETE CASCADE,
        "name" varchar(100) NOT NULL,
        "extra_price" numeric(10,2) NOT NULL DEFAULT 0,
        "is_removable" boolean NOT NULL DEFAULT true,
        "is_available" boolean NOT NULL DEFAULT true,
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_modifier_options_group_sort" ON "modifier_options" ("group_id", "sort_order")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_modifier_options_available" ON "modifier_options" ("is_available")`,
    );

    await queryRunner.query(`
      CREATE TABLE "product_modifier_groups" (
        "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "group_id" uuid NOT NULL REFERENCES "modifier_groups"("id") ON DELETE CASCADE,
        PRIMARY KEY ("product_id", "group_id")
      )
    `);

    // Qué opciones vienen por defecto en cada producto (sparse: solo las
    // incluidas; el resto del grupo enlazado se ofrece como adicional).
    await queryRunner.query(`
      CREATE TABLE "product_modifier_options" (
        "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "option_id" uuid NOT NULL REFERENCES "modifier_options"("id") ON DELETE CASCADE,
        "included_by_default" boolean NOT NULL DEFAULT true,
        "sort_order" int NOT NULL DEFAULT 0,
        PRIMARY KEY ("product_id", "option_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "product_modifier_options"`);
    await queryRunner.query(`DROP TABLE "product_modifier_groups"`);
    await queryRunner.query(`DROP TABLE "modifier_options"`);
    await queryRunner.query(`DROP TABLE "modifier_groups"`);
    await queryRunner.query(`DROP TABLE "combo_items"`);
    await queryRunner.query(`DROP TABLE "product_images"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
