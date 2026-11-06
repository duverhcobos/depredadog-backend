import { OrderItemModifier } from './order-item-modifier.entity';

export class OrderItem {
  id!: string;
  orderId!: string;
  productId!: string;
  /** Snapshots — el producto puede renombrarse o cambiar de precio. */
  productName!: string;
  unitPrice!: number;
  quantity!: number;
  lineTotal!: number;
  notes: string | null = null;
  modifiers: OrderItemModifier[] = [];
}
