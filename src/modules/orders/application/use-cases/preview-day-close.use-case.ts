import { Inject, Injectable } from '@nestjs/common';
import { DayCloseMethodBreakdown } from '../../domain/entities/day-close.entity';
import { Order } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';

export interface DayCloseSummary {
  orderCount: number;
  totalAmount: number;
  byMethod: DayCloseMethodBreakdown[];
  cancelledCount: number;
  cancelledAmount: number;
  orders: {
    id: string;
    orderNumber: number;
    total: number;
    paymentMethod: string;
  }[];
}

// Snapshot compartido por preview y cierre: done suma al total por su
// método de pago; cancelled cuenta aparte como contexto del periodo.
// El invariante de transición garantiza "done ⇒ paid" — el resumen
// usa el método del pago, no su status.
export function buildDayCloseSummary(orders: Order[]): DayCloseSummary {
  const byMethod = new Map<string, { count: number; amount: number }>();
  const cancelled = orders.filter((o) => o.status === OrderStatus.CANCELLED);
  const items = orders
    .filter((o) => o.status === OrderStatus.DONE)
    .map((o) => {
      const method = o.payment?.method ?? 'unknown';
      const m = byMethod.get(method) ?? { count: 0, amount: 0 };
      m.count += 1;
      m.amount += o.total;
      byMethod.set(method, m);
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        total: o.total,
        paymentMethod: method,
      };
    });
  return {
    orderCount: items.length,
    totalAmount: items.reduce((acc, i) => acc + i.total, 0),
    byMethod: [...byMethod.entries()].map(([method, v]) => ({
      method,
      count: v.count,
      amount: v.amount,
    })),
    cancelledCount: cancelled.length,
    cancelledAmount: cancelled.reduce((acc, o) => acc + o.total, 0),
    orders: items,
  };
}

@Injectable()
export class PreviewDayCloseUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
  ) {}

  async execute(): Promise<DayCloseSummary> {
    const orders = await this.orders.findUnclosedTerminal();
    return buildDayCloseSummary(orders);
  }
}
