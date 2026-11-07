import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderPhonesAndLocationLink1794060585949 implements MigrationInterface {
    name = 'AddOrderPhonesAndLocationLink1794060585949';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // §024 — quién recibe (delivery lo exige en app).
        await queryRunner.query(
            `ALTER TABLE "orders" ADD COLUMN "contact_phone" varchar(20)`,
        );
        // Pin de Google adjunto al pedido (§022d) — sirve con dirección
        // guardada o nueva; NO se pliega en delivery_address.
        await queryRunner.query(
            `ALTER TABLE "orders" ADD COLUMN "delivery_location_link" text`,
        );
        // §024 — quién paga: el celular que recibe el push (transfer).
        await queryRunner.query(
            `ALTER TABLE "payments" ADD COLUMN "payer_phone" varchar(20)`,
        );
        // Idempotencia del POST — doble-tap/reintento responde la misma
        // orden en vez de duplicarla. NULL en presencial/manual.
        await queryRunner.query(
            `ALTER TABLE "orders" ADD COLUMN "client_request_id" uuid`,
        );
        await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_orders_client_request"
      ON "orders" ("customer_id", "client_request_id")
      WHERE "client_request_id" IS NOT NULL
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "uq_orders_client_request"`);
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "client_request_id"`,
        );
        await queryRunner.query(
            `ALTER TABLE "payments" DROP COLUMN "payer_phone"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "delivery_location_link"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP COLUMN "contact_phone"`,
        );
    }
}
