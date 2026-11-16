import { Inject, Injectable } from '@nestjs/common';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../../auth/domain/repositories/user.repository.interface';
import { PaymentStatus } from '../../../payments/domain/enums/payment-status.enum';
import { StoreTable } from '../../../store/domain/entities/store-table.entity';
import {
  type IStoreRepository,
  STORE_REPOSITORY,
} from '../../../store/domain/repositories/store.repository.interface';
import { Order } from '../../domain/entities/order.entity';
import { OrderChannel } from '../../domain/enums/order-channel.enum';
import { OrderServiceType } from '../../domain/enums/order-service-type.enum';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { OrderNotFoundException } from '../../domain/exceptions/order-not-found.exception';
import { PaymentNotConfirmableException } from '../../domain/exceptions/payment-not-confirmable.exception';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { AdminOrderResult } from './admin-order-results';

export interface ConfirmOrderPaymentCommand {
  orderId: string;
  adminId: string;
}

// El dueño marca "me pagó" — cash en la entrega/mesa, transfer manual
// futuro. Claim atómico: UPDATE payments SET paid+confirmed_by+now
// WHERE order_id AND status='pending'; affected=0 → ya resuelto
// (idempotente si era paid; 409 si era failed/refunded). Además el
// cobro AVANZA la orden en el mismo hecho (§037.D): received→confirmed
// en recogida presencial y ready→done — en los demás estados solo
// registra el pago.
@Injectable()
export class ConfirmOrderPaymentUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
    @Inject(STORE_REPOSITORY)
    private readonly store: IStoreRepository,
    @Inject(USER_REPOSITORY)
    private readonly users: IUserRepository,
  ) {}

  async execute(cmd: ConfirmOrderPaymentCommand): Promise<AdminOrderResult> {
    const order = await this.orders.findById(cmd.orderId);
    if (!order) throw new OrderNotFoundException();
    const payment = order.payment;
    if (!payment) throw new PaymentNotConfirmableException();
    // Idempotente: doble tap del dueño o reintento — un pago ya
    // resuelto responde la orden tal cual sin tocar nada.
    if (payment.status === PaymentStatus.PAID) {
      return { order, ...(await this.adminView(order)) };
    }
    // Un failed/refunded no resucita — 409 honesto (el reembolso o
    // re-cobro se resuelven por otro flujo).
    if (payment.status !== PaymentStatus.PENDING) {
      throw new PaymentNotConfirmableException();
    }
    const claimed = await this.orders.confirmPayment(order.id, cmd.adminId);
    if (!claimed) throw new PaymentNotConfirmableException();
    payment.status = PaymentStatus.PAID;
    payment.confirmedBy = cmd.adminId;
    payment.confirmedAt = new Date();
    // §037.D — "Registrar pago" cobra Y avanza en el mismo hecho:
    // la recogida presencial sale de la bandeja al cobrarse (received
    // →confirmed) y el pedido listo se entrega al cobrarse (ready→done
    // — mesa que paga y se va, domicilio cobrado en la puerta). En los
    // demás estados solo queda registrado el pago (delivery transfer
    // en received confirma aparte — se puede confirmar sin cobrar).
    const to = this.implicitAdvance(order);
    if (to) {
      order.statusChangedAt = new Date();
      const moved = await this.orders.transitionStatus(order, to);
      // Carrera perdida (otro admin/webhook movió la orden): el pago
      // ya quedó paid — releer y responder el estado real, idempotente.
      if (!moved) {
        const fresh = await this.orders.findById(order.id);
        return {
          order: fresh ?? order,
          ...(await this.adminView(fresh ?? order)),
        };
      }
      order.status = to;
    }
    return { order, ...(await this.adminView(order)) };
  }

  // Transición implícita del cobro (§037.D) — null = solo marcar paid.
  private implicitAdvance(order: Order): OrderStatus | null {
    if (
      order.status === OrderStatus.PENDING &&
      order.channel === OrderChannel.PRESENCIAL &&
      order.serviceType === OrderServiceType.PICKUP
    ) {
      return OrderStatus.CONFIRMED;
    }
    if (order.status === OrderStatus.READY) {
      return OrderStatus.DONE;
    }
    return null;
  }

  // Misma hidratación que update-status: tableLabel/customerName.
  private async adminView(
    order: Order,
  ): Promise<{ tableLabel: string | null; customerName: string | null }> {
    const [tables, names] = await Promise.all([
      order.tableId
        ? this.store.getTablesByIds([order.tableId])
        : Promise.resolve<StoreTable[]>([]),
      order.customerId
        ? this.users.findNamesByIds([order.customerId])
        : Promise.resolve(new Map<string, string>()),
    ]);
    return {
      tableLabel: order.tableId
        ? (tables.find((t) => t.id === order.tableId)?.label ?? null)
        : null,
      customerName: order.customerId
        ? (names.get(order.customerId) ?? null)
        : null,
    };
  }
}
