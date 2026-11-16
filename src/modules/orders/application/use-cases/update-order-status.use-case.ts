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
import { InvalidStatusTransitionException } from '../../domain/exceptions/invalid-status-transition.exception';
import { OrderNotFoundException } from '../../domain/exceptions/order-not-found.exception';
import { PaymentNotSettledException } from '../../domain/exceptions/payment-not-settled.exception';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { AdminOrderResult } from './admin-order-results';

export interface UpdateOrderStatusCommand {
  orderId: string;
  to: OrderStatus;
  cancelReason?: string;
}

// pending→confirmed→preparing→ready→done + cancelled en cualquier
// no terminal — el kanban Cocina de 5 carriles (§022): 'preparing'
// pasa a ser real (decisión del dueño, revoca §019) y 'ready' es el
// paso intermedio que la app etiqueta por serviceType
// ("Va en camino"/"Servido"/"Listo p/recoger").
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  pending: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  confirmed: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  preparing: [OrderStatus.READY, OrderStatus.CANCELLED],
  ready: [OrderStatus.DONE, OrderStatus.CANCELLED],
  done: [],
  cancelled: [],
};

@Injectable()
export class UpdateOrderStatusUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
    @Inject(STORE_REPOSITORY)
    private readonly store: IStoreRepository,
    @Inject(USER_REPOSITORY)
    private readonly users: IUserRepository,
  ) {}

  async execute(cmd: UpdateOrderStatusCommand): Promise<AdminOrderResult> {
    const order = await this.orders.findById(cmd.orderId);
    if (!order) throw new OrderNotFoundException();
    // La matriz se evalúa ANTES de cualquier write — 'to' fuera de
    // ALLOWED[from] → 409 sin tocar nada.
    if (!ALLOWED[order.status].includes(cmd.to)) {
      throw new InvalidStatusTransitionException();
    }
    // Invariante del negocio: no se entrega sin cobrar — done exige
    // el payment ya resuelto (cash se marca con confirm-payment;
    // transfer espera su webhook).
    if (
      cmd.to === OrderStatus.DONE &&
      order.payment?.status !== PaymentStatus.PAID
    ) {
      throw new PaymentNotSettledException();
    }
    // Puerta de confirmación §037.D: la recogida presencial sin
    // cobrar no confirma — el cobro era el único bloqueo; el camino
    // autorizado es confirm-payment (cobra Y avanza en un hecho).
    if (
      cmd.to === OrderStatus.CONFIRMED &&
      order.channel === OrderChannel.PRESENCIAL &&
      order.serviceType === OrderServiceType.PICKUP &&
      order.payment?.status !== PaymentStatus.PAID
    ) {
      throw new PaymentNotSettledException();
    }
    // Cancel con pago pendiente: el pago muere con la orden (claim
    // condicional igual que el cancel del cliente). Un 'paid' NO se
    // toca — el reembolso se resuelve manual (pendiente).
    if (cmd.to === OrderStatus.CANCELLED) {
      order.cancelReason = cmd.cancelReason?.trim() || null;
      if (order.payment?.status === PaymentStatus.PENDING) {
        order.payment.status = PaymentStatus.FAILED;
      }
    }
    // UPDATE condicional: affected=0 → el estado cambió entre la
    // lectura y el write (webhook o doble tap del dueño) → 409, no
    // un write ciego. El par status+statusChangedAt viaja atómico
    // en el mismo UPDATE (§037.A — cada carril ordena por cuándo
    // entró el pedido a ese estado).
    order.statusChangedAt = new Date();
    const moved = await this.orders.transitionStatus(order, cmd.to);
    if (!moved) throw new InvalidStatusTransitionException();
    order.status = cmd.to;
    // Misma hidratación que el listado — el service convierte a DTO.
    return { order, ...(await this.adminView(order)) };
  }

  // tableLabel/customerName del detalle — una fila, los lookups son
  // por id (sin N+1: una sola orden).
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
