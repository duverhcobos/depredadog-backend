import { Payment } from '../../../payments/domain/entities/payment.entity';
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
  /** Quién recibe — la app lo exige en delivery (§024). */
  contactPhone: string | null = null;
  /** Pin de Google adjunto al pedido (§022d). */
  deliveryLocationLink: string | null = null;
  /** Idempotencia del POST del cliente — UNIQUE con customer_id. */
  clientRequestId: string | null = null;
  /** Cargados por el repositorio cuando el use-case los pide. */
  items: OrderItem[] = [];
  /** Cargado por el repositorio cuando el use-case lo pide. */
  payment: Payment | null = null;
  createdAt!: Date;
  updatedAt!: Date;
}
