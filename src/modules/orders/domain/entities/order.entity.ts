import { OrderChannel } from '../enums/order-channel.enum';
import { OrderServiceType } from '../enums/order-service-type.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderItem } from './order-item.entity';

export class Order {
  id!: string;
  /** Día de negocio en la tz del local ('YYYY-MM-DD') — reset diario
   * del consecutivo con UNIQUE(order_date, order_number). */
  orderDate!: string;
  orderNumber!: number;
  channel!: OrderChannel;
  serviceType!: OrderServiceType;
  customerId: string | null = null;
  takenBy: string | null = null;
  tableId: string | null = null;
  addressId: string | null = null;
  deliveryAddress: string | null = null;
  status: OrderStatus = OrderStatus.PENDING;
  subtotal!: number;
  deliveryFee = 0;
  discount = 0;
  total!: number;
  notes: string | null = null;
  cancelReason: string | null = null;
  /** Cargados por el repositorio cuando el use-case los pide. */
  items: OrderItem[] = [];
  createdAt!: Date;
  updatedAt!: Date;
}
