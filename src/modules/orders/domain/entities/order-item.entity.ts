import { OrderItemModifier } from './order-item-modifier.entity';

export class OrderItem {
  id!: string;
  orderId!: string;
  productId!: string;
  /** Snapshots — el producto puede renombrarse o cambiar de precio. */
  productName!: string;
  /** Snapshot del slug — la app mapea assets/foto por él (§016). */
  productSlug: string | null = null;
  unitPrice!: number;
  quantity!: number;
  lineTotal!: number;
  notes: string | null = null;
  /** "Lleva:" del detalle — incluidos por defecto MENOS quitados/
   *  reemplazados, snapshot al crear (§016). */
  includedNames: string[] = [];
  modifiers: OrderItemModifier[] = [];
}
