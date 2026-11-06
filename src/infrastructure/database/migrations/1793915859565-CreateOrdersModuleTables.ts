import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrdersModuleTables1793915859565 implements MigrationInterface {
  name = 'CreateOrdersModuleTables1793915859565';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "order_channel" AS ENUM ('online', 'presencial')`,
    );
    await queryRunner.query(
      `CREATE TYPE "order_service_type" AS ENUM ('pickup', 'delivery', 'dine_in')`,
    );
    await queryRunner.query(
      `CREATE TYPE "order_status" AS ENUM ('pending', 'confirmed', 'preparing', 'done', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "payment_method" AS ENUM ('cash', 'transfer', 'gateway')`,
    );
    await queryRunner.query(
      `CREATE TYPE "payment_status" AS ENUM ('pending', 'paid', 'failed', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TYPE "modifier_action" AS ENUM ('added', 'removed')`,
    );

    // Una sola fila — config global del negocio (single-tenant).
    await queryRunner.query(`
      CREATE TABLE "store_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(150) NOT NULL,
        "phone" varchar(20),
        "address" varchar(255),
        "logo_url" varchar(500),
        "delivery_fee" numeric(10,2) NOT NULL DEFAULT 0,
        "min_delivery_order" numeric(10,2),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Un rango por día (0=domingo…6=sábado). is_closed=true concentra el
    // "no abre" — opens_at/closes_at quedan NOT NULL con valor centinela.
    await queryRunner.query(`
      CREATE TABLE "business_hours" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "day_of_week" smallint NOT NULL,
        "opens_at" time NOT NULL,
        "closes_at" time NOT NULL,
        "is_closed" boolean NOT NULL DEFAULT false,
        CONSTRAINT "uq_business_hours_day" UNIQUE ("day_of_week"),
        CONSTRAINT "chk_business_hours_dow" CHECK ("day_of_week" BETWEEN 0 AND 6)
      )
    `);

    // Mesas mínimas — el pedido presencial (dine_in) las referencia.
    await queryRunner.query(`
      CREATE TABLE "tables" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "label" varchar(20) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_tables_label" UNIQUE ("label")
      )
    `);

    // order_date = día de negocio en la tz del local (lo escribe la app
    // de backend al crear el pedido) → reset diario del consecutivo.
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_date" date NOT NULL,
        "order_number" int NOT NULL,
        "channel" order_channel NOT NULL,
        "service_type" order_service_type NOT NULL,
        "customer_id" uuid REFERENCES "users"("id"),
        "taken_by" uuid REFERENCES "users"("id"),
        "table_id" uuid REFERENCES "tables"("id"),
        "address_id" uuid REFERENCES "addresses"("id"),
        "delivery_address" text,
        "status" order_status NOT NULL DEFAULT 'pending',
        "subtotal" numeric(10,2) NOT NULL,
        "delivery_fee" numeric(10,2) NOT NULL DEFAULT 0,
        "discount" numeric(10,2) NOT NULL DEFAULT 0,
        "total" numeric(10,2) NOT NULL,
        "notes" text,
        "cancel_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_orders_day_number" UNIQUE ("order_date", "order_number")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_orders_status_created" ON "orders" ("status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_orders_customer_created" ON "orders" ("customer_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_orders_table_open" ON "orders" ("table_id") WHERE "status" NOT IN ('done','cancelled')`,
    );

    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "product_id" uuid NOT NULL REFERENCES "products"("id"),
        "product_name" varchar(150) NOT NULL,
        "unit_price" numeric(10,2) NOT NULL,
        "quantity" int NOT NULL,
        "line_total" numeric(10,2) NOT NULL,
        "notes" text
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_order_items_order" ON "order_items" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_order_items_product" ON "order_items" ("product_id")`,
    );

    // option_id nullable: la fila sobrevive si la opción se borra del
    // catálogo — el snapshot (option_name, price_delta) basta al reporte.
    await queryRunner.query(`
      CREATE TABLE "order_item_modifiers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_item_id" uuid NOT NULL REFERENCES "order_items"("id") ON DELETE CASCADE,
        "option_id" uuid REFERENCES "modifier_options"("id"),
        "option_name" varchar(100) NOT NULL,
        "action" modifier_action NOT NULL,
        "price_delta" numeric(10,2) NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_oim_item" ON "order_item_modifiers" ("order_item_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_oim_option" ON "order_item_modifiers" ("option_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL REFERENCES "orders"("id"),
        "method" payment_method NOT NULL,
        "status" payment_status NOT NULL DEFAULT 'pending',
        "amount" numeric(10,2) NOT NULL,
        "provider" varchar(50),
        "provider_reference" varchar(255),
        "provider_payload" jsonb,
        "evidence_url" varchar(500),
        "confirmed_by" uuid REFERENCES "users"("id"),
        "confirmed_at" timestamptz,
        "refunded_at" timestamptz,
        "refund_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_payments_order" ON "payments" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payments_status_created" ON "payments" ("status", "created_at")`,
    );
    // Un solo pago "vivo" por orden — reintentos dejan la fila anterior
    // en failed/cancelled antes de crear la nueva.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_payments_one_live" ON "payments" ("order_id") WHERE "status" IN ('pending','paid')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TABLE "order_item_modifiers"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TABLE "tables"`);
    await queryRunner.query(`DROP TABLE "business_hours"`);
    await queryRunner.query(`DROP TABLE "store_settings"`);
    await queryRunner.query(`DROP TYPE "modifier_action"`);
    await queryRunner.query(`DROP TYPE "payment_status"`);
    await queryRunner.query(`DROP TYPE "payment_method"`);
    await queryRunner.query(`DROP TYPE "order_status"`);
    await queryRunner.query(`DROP TYPE "order_service_type"`);
    await queryRunner.query(`DROP TYPE "order_channel"`);
  }
}
