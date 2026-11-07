import { Inject, Injectable } from '@nestjs/common';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
  OrderListPage,
} from '../../domain/repositories/order.repository.interface';

export interface ListMyOrdersCommand {
  customerId: string;
  bucket: 'active' | 'history';
  page: number;
  limit: number;
}

@Injectable()
export class ListMyOrdersUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
  ) {}

  execute(cmd: ListMyOrdersCommand): Promise<OrderListPage> {
    return this.orders.findByCustomer(
      cmd.customerId,
      cmd.bucket,
      cmd.page,
      cmd.limit,
    );
  }
}
