import { Inject, Injectable } from '@nestjs/common';
import { PaymentStatus } from '../../../payments/domain/enums/payment-status.enum';
import { WebhookStatus } from '../../../payments/domain/enums/webhook-status.enum';
import { Order } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { PaymentNotFoundException } from '../../domain/exceptions/payment-not-found.exception';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';

export interface ResolveOrderPaymentCommand {
  provider: string;
  reference: string;
  status: WebhookStatus;
  payload?: Record<string, unknown>;
}

// Razones en español — cancel_reason es user-facing (la app lo muestra
// en el detalle del historial, igual que 'Cancelado por el cliente').
const CANCEL_REASON: Record<string, string> = {
  rejected: 'Pago rechazado por el proveedor',
  expired: 'El pago expiró sin aprobación',
  cancelled: 'Pago cancelado por el proveedor',
};

@Injectable()
export class ResolveOrderPaymentUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
  ) {}

  async execute(cmd: ResolveOrderPaymentCommand): Promise<Order> {
    const order = await this.orders.findByProviderReference(
      cmd.provider,
      cmd.reference,
    );
    if (!order?.payment) {
      throw new PaymentNotFoundException();
    }
    // Idempotente: el proveedor reintenta webhooks — un pago ya
    // resuelto responde 200 sin tocar nada (la orden pudo avanzar o
    // haberse cancelado por otra vía; nunca se revierte).
    if (order.payment.status !== PaymentStatus.PENDING) {
      return order;
    }
    order.payment.providerPayload = cmd.payload ?? null;
    if (cmd.status === 'approved') {
      order.payment.status = PaymentStatus.PAID;
      order.payment.confirmedAt = new Date();
      // Solo un pedido vivo se confirma — si el cliente ya lo canceló
      // el pago aprobado queda registrado sin resucitar la orden.
      if (order.status === OrderStatus.PENDING) {
        order.status = OrderStatus.CONFIRMED;
      }
    } else {
      order.payment.status = PaymentStatus.FAILED;
      if (order.status === OrderStatus.PENDING) {
        order.status = OrderStatus.CANCELLED;
        order.cancelReason = CANCEL_REASON[cmd.status];
      }
    }
    // Claim atómico en el repositorio: el UPDATE condicional sobre
    // payments.status='pending' es la puerta — si un webhook paralelo
    // (o el cancel del cliente) ya resolvió, null y se re-lee el
    // estado ganador para responder igual de idempotente.
    const resolved = await this.orders.resolvePaymentAggregate(order);
    if (resolved) return resolved;
    const fresh = await this.orders.findByProviderReference(
      cmd.provider,
      cmd.reference,
    );
    return fresh ?? order;
  }
}
