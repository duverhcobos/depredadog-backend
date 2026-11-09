import { EntitySchema } from 'typeorm';
import { OrderItem } from '../../../modules/orders/domain/entities/order-item.entity';

const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const OrderItemSchema = new EntitySchema<OrderItem>({
  name: 'OrderItem',
  target: OrderItem,
  tableName: 'order_items',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    orderId: { name: 'order_id', type: 'uuid' },
    productId: { name: 'product_id', type: 'uuid' },
    productName: { name: 'product_name', type: 'varchar', length: 150 },
    unitPrice: {
      name: 'unit_price',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
    },
    quantity: { type: 'int' },
    lineTotal: {
      name: 'line_total',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
    },
    notes: { type: 'text', nullable: true },
    productSlug: {
      name: 'product_slug',
      type: 'varchar',
      length: 120,
      nullable: true,
    },
    includedNames: {
      name: 'included_names',
      type: 'text',
      array: true,
      default: () => "'{}'",
    },
  },
});
