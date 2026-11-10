import { Inject, Injectable } from '@nestjs/common';
import {
  type IStoreRepository,
  STORE_REPOSITORY,
} from '../../../store/domain/repositories/store.repository.interface';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { AdminTablesResult } from './admin-order-results';

// Panel de mesas del dueño: catálogo de mesas + el pedido dine_in
// vivo de cada una (null = libre).
@Injectable()
export class ListAdminTablesUseCase {
  constructor(
    @Inject(STORE_REPOSITORY)
    private readonly store: IStoreRepository,
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
  ) {}

  async execute(): Promise<AdminTablesResult> {
    const [tables, activeByTable] = await Promise.all([
      this.store.getTables(),
      this.orders.findActiveTableIds(),
    ]);
    return { tables, activeByTable };
  }
}
