import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderStatusChangedAt1794695034154 implements MigrationInterface {
  name = 'AddOrderStatusChangedAt1794695034154';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // §037.A — cuándo entró el pedido a su estado actual: cada carril
    // del kanban ordena por esto, no por created_at.
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "status_changed_at" timestamptz`,
    );
    // Backfill: las filas existentes siguen en su estado de nacimiento
    // (nacer = entrar) → status_changed_at = created_at.
    await queryRunner.query(
      `UPDATE "orders" SET "status_changed_at" = "created_at" WHERE "status_changed_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status_changed_at" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "status_changed_at"`,
    );
  }
}
