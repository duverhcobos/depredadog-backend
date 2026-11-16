import { Inject, Injectable } from '@nestjs/common';
import { PaymentStatus } from '../../../payments/domain/enums/payment-status.enum';
import { Order } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { OrderNotCancellableException } from '../../domain/exceptions/order-not-cancellable.exception';
import { OrderNotFoundException } from '../../domain/exceptions/order-not-found.exception';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';

export interface CancelMyOrderCommand {
  orderId: string;
  customerId: string;
  reason?: string;
}

@Injectable()
export class CancelMyOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
  ) {}

  async execute(cmd: CancelMyOrderCommand): Promise<Order> {
    const order = await this.orders.findByIdForCustomer(
      cmd.orderId,
      cmd.customerId,
    );
    if (!order) throw new OrderNotFoundException();
    if (order.status !== OrderStatus.PENDING) {
      throw new OrderNotCancellableException();
    }
    order.status = OrderStatus.CANCELLED;
    order.statusChangedAt = new Date();
    order.cancelReason = cmd.reason?.trim() || null;
    // Pago pendiente → failed en la misma tx — sin huérfanos de push.
    if (order.payment?.status === PaymentStatus.PENDING) {
      order.payment.status = PaymentStatus.FAILED;
    }
    // El UPDATE condicional es la verdad atómica: si el webhook del
    // proveedor confirmó/pagó entre el check de arriba y este write,
    // affected=0 → el pedido YA no es cancelable (respuesta honesta,
    // no un cancel que miente).
    const cancelled = await this.orders.cancelPendingAggregate(order);
    if (!cancelled) throw new OrderNotCancellableException();
    return order;
  }
}
