import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReadyStatusAndDayCloses1794695033129 implements MigrationInterface {
  name = 'AddReadyStatusAndDayCloses1794695033129';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Kanban Cocina §022: 'ready' es el 4º carril. PG ≥12 permite
    // ADD VALUE dentro de tx siempre que el valor no se use en la
    // misma — acá solo se agrega, las filas lo adoptan después.
    await queryRunner.query(
      `ALTER TYPE "order_status" ADD VALUE IF NOT EXISTS 'ready'`,
    );

    // Registro auditable del cierre de caja: snapshot del hecho (no
    // se recalcula). method_breakdown = [{method,count,amount}].
    await queryRunner.query(`
      CREATE TABLE "day_closes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "closed_by" uuid NOT NULL REFERENCES "users"("id"),
        "closed_at" timestamptz NOT NULL,
        "order_count" int NOT NULL DEFAULT 0,
        "total_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "cancelled_count" int NOT NULL DEFAULT 0,
        "cancelled_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "method_breakdown" jsonb NOT NULL DEFAULT '[]',
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // NULL = aún visible en Cocina (los done sin cerrar siguen en
    // el bucket active hasta el cierre).
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "day_close_id" uuid REFERENCES "day_closes"("id")`,
    );
    // La cola activa filtra por "done sin cerrar" — índice parcial.
    await queryRunner.query(
      `CREATE INDEX "idx_orders_day_close_open" ON "orders" ("day_close_id") WHERE "day_close_id" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_orders_day_close_open"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "day_close_id"`);
    await queryRunner.query(`DROP TABLE "day_closes"`);
    // NOTA: el valor 'ready' del enum order_status NO se remueve —
    // Postgres no soporta quitar valores de un enum; un revert
    // completo exigiría recrear el tipo (ALTER TYPE ... RENAME +
    // CREATE TYPE + cast de la columna), fuera del revert estándar.
  }
}
