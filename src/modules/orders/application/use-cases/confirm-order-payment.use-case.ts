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
// (idempotente si era paid; 409 si era failed/refunded).
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
    return { order, ...(await this.adminView(order)) };
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
