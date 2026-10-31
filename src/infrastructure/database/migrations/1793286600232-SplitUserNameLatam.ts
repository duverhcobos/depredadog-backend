import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class SplitUserNameLatam1793286600232 implements MigrationInterface {
  name = 'SplitUserNameLatam1793286600232';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Filas existentes: nulls -> '' antes de exigir NOT NULL (en dev hay
    // pocos registros; en prod se decidiría un backfill explícito).
    await queryRunner.query(
      `UPDATE "users" SET "last_name" = '' WHERE "last_name" IS NULL`,
    );
    await queryRunner.renameColumn('users', 'last_name', 'first_last_name');
    // ALTER COLUMN crudo: el cambio queda explícito y legible en una sola
    // instrucción — changeColumn resolvería igual pero genera más SQL.
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "first_last_name" SET NOT NULL`,
    );
    await queryRunner.addColumns('users', [
      new TableColumn({
        name: 'second_name',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
      new TableColumn({
        name: 'second_last_name',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'second_last_name');
    await queryRunner.dropColumn('users', 'second_name');
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "first_last_name" DROP NOT NULL`,
    );
    await queryRunner.renameColumn('users', 'first_last_name', 'last_name');
  }
}
