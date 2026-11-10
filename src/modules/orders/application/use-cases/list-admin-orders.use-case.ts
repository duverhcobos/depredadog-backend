import { Inject, Injectable } from '@nestjs/common';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../../auth/domain/repositories/user.repository.interface';
import {
  type IStoreRepository,
  STORE_REPOSITORY,
} from '../../../store/domain/repositories/store.repository.interface';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { AdminOrderListResult } from './admin-order-results';

export interface ListAdminOrdersQuery {
  bucket: 'active' | 'history';
  page: number;
  limit: number;
}

// Cola del local: active = pending/confirmed/preparing de CUALQUIER
// fecha (un pending de ayer no se puede perder — el dueño lo resuelve);
// history = done/cancelled paginado. Sin filtro de cliente: el dueño
// ve todo (las presenciales tienen customer_id NULL y aparecen igual).
@Injectable()
export class ListAdminOrdersUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
    @Inject(STORE_REPOSITORY)
    private readonly store: IStoreRepository,
    @Inject(USER_REPOSITORY)
    private readonly users: IUserRepository,
  ) {}

  async execute(q: ListAdminOrdersQuery): Promise<AdminOrderListResult> {
    const page = await this.orders.findForAdmin(q.bucket, q.page, q.limit);
    // Enriquecimiento batcheado (anti N+1): labels de mesas usadas +
    // nombres de clientes de las filas de la página.
    const tableIds = [
      ...new Set(
        page.items.map((o) => o.tableId).filter((t): t is string => !!t),
      ),
    ];
    const customerIds = [
      ...new Set(
        page.items.map((o) => o.customerId).filter((c): c is string => !!c),
      ),
    ];
    const [tables, names] = await Promise.all([
      this.store.getTablesByIds(tableIds),
      this.users.findNamesByIds(customerIds),
    ]);
    const labelByTable = new Map(tables.map((t) => [t.id, t.label]));
    return {
      items: page.items.map((o) => ({
        order: o,
        tableLabel: o.tableId ? (labelByTable.get(o.tableId) ?? null) : null,
        customerName: o.customerId ? (names.get(o.customerId) ?? null) : null,
      })),
      total: page.total,
    };
  }
}
