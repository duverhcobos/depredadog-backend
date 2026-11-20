import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

// Porciones extra repetibles (§026): una fila `added` puede cobrar el
// adicional N veces (doble/triple mozzarella). `price_delta` sigue
// siendo el TOTAL de línea (extra × times) — `times` solo contextualiza.
// DEFAULT 1 backfillea las filas viejas: eran binarias, equivalen a 1.
export class AddTimesToOrderItemModifiers1795207387921 implements MigrationInterface {
  name = 'AddTimesToOrderItemModifiers1795207387921';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'order_item_modifiers',
      new TableColumn({
        name: 'times',
        type: 'int',
        isNullable: false,
        default: 1,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('order_item_modifiers', 'times');
  }
}
