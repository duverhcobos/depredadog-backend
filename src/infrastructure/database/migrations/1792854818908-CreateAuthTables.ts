import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthTables1792854818908 implements MigrationInterface {
  name = 'CreateAuthTables1792854818908';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);
    await queryRunner.query(
      `CREATE TYPE "user_role" AS ENUM ('customer', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TYPE "user_status" AS ENUM ('pending_verification', 'active', 'suspended')`,
    );
    await queryRunner.query(
      `CREATE TYPE "auth_token_type" AS ENUM ('email_verification', 'password_reset')`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" citext NOT NULL,
        "password_hash" varchar(255),
        "google_id" varchar(255),
        "role" "user_role" NOT NULL DEFAULT 'customer',
        "status" "user_status" NOT NULL DEFAULT 'pending_verification',
        "email_verified_at" timestamptz,
        "first_name" varchar(100) NOT NULL,
        "last_name" varchar(100),
        "phone" varchar(20),
        "registered_ip" inet,
        "referral_code" varchar(20) NOT NULL,
        "referred_by" uuid REFERENCES "users"("id"),
        "marketing_opt_in" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "uq_users_email" UNIQUE ("email"),
        CONSTRAINT "uq_users_google_id" UNIQUE ("google_id"),
        CONSTRAINT "uq_users_referral_code" UNIQUE ("referral_code")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_users_status" ON "users" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_users_referred_by" ON "users" ("referred_by")`,
    );

    await queryRunner.query(`
      CREATE TABLE "addresses" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "label" varchar(50) NOT NULL,
        "address_line" varchar(255) NOT NULL,
        "reference" text,
        "latitude" numeric(9,6),
        "longitude" numeric(9,6),
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_addresses_user_id" ON "addresses" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_addresses_default" ON "addresses" ("user_id") WHERE "is_default"`,
    );

    await queryRunner.query(`
      CREATE TABLE "devices" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "fingerprint" varchar(255) NOT NULL,
        "platform" varchar(20),
        "push_token" varchar(255),
        "notifications_enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_seen_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_devices_user_fingerprint" UNIQUE ("user_id", "fingerprint")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_devices_fingerprint" ON "devices" ("fingerprint")`,
    );

    await queryRunner.query(`
      CREATE TABLE "auth_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" varchar(255) NOT NULL,
        "type" "auth_token_type" NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_auth_tokens_token_hash" ON "auth_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_auth_tokens_user_type" ON "auth_tokens" ("user_id", "type")`,
    );

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "device_id" uuid REFERENCES "devices"("id") ON DELETE SET NULL,
        "token_hash" varchar(255) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_refresh_tokens_token_hash" UNIQUE ("token_hash")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_device_id" ON "refresh_tokens" ("device_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "auth_tokens"`);
    await queryRunner.query(`DROP TABLE "devices"`);
    await queryRunner.query(`DROP TABLE "addresses"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "auth_token_type"`);
    await queryRunner.query(`DROP TYPE "user_status"`);
    await queryRunner.query(`DROP TYPE "user_role"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS citext`);
  }
}
