import { Address } from '../../../auth/domain/entities/address.entity';
import { Payment } from '../../../payments/domain/entities/payment.entity';
import type { AppliedPromotion } from '../../../promotions/domain/services/promotion-evaluator.service';
import { OrderChannel } from '../enums/order-channel.enum';
import { OrderServiceType } from '../enums/order-service-type.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { DayClose } from './day-close.entity';
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
  /** Cierre de caja que archivó la orden — NULL = aún visible en Cocina. */
  dayCloseId: string | null = null;
  /** Cuándo entró al estado actual — cada carril del kanban ordena
   * por esto (nacer = entrar: create-order lo siembra = created_at). */
  statusChangedAt!: Date;
  subtotal!: number;
  deliveryFee = 0;
  discount = 0;
  /** Snapshot de las promos del motor (§027) — sobrevive a desactivar
   * o editar la oferta después. null = pedido anterior al motor. */
  appliedPromotions: AppliedPromotion[] | null = null;
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
  /** Dirección del domicilio — join de la vista admin (§037.B). */
  address: Address | null = null;
  /** Cierre que la archivó — carga explícita (relación day_close_id). */
  dayClose: DayClose | null = null;
  createdAt!: Date;
  updatedAt!: Date;
}
