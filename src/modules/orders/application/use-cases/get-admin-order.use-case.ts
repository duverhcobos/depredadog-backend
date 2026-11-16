import { Inject, Injectable } from '@nestjs/common';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../../auth/domain/repositories/user.repository.interface';
import { StoreTable } from '../../../store/domain/entities/store-table.entity';
import {
  type IStoreRepository,
  STORE_REPOSITORY,
} from '../../../store/domain/repositories/store.repository.interface';
import { Order } from '../../domain/entities/order.entity';
import { OrderNotFoundException } from '../../domain/exceptions/order-not-found.exception';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { AdminOrderResult } from './admin-order-results';

export interface GetAdminOrderCommand {
  orderId: string;
}

// Detalle del dueño: id solo, sin filtro de cliente — el agregado
// completo (ítems + modifiers + address) lo carga findById.
@Injectable()
export class GetAdminOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
    @Inject(STORE_REPOSITORY)
    private readonly store: IStoreRepository,
    @Inject(USER_REPOSITORY)
    private readonly users: IUserRepository,
  ) {}

  async execute(cmd: GetAdminOrderCommand): Promise<AdminOrderResult> {
    const order = await this.orders.findById(cmd.orderId);
    if (!order) throw new OrderNotFoundException();
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
