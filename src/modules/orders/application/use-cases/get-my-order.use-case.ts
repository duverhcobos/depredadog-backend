import { Inject, Injectable } from '@nestjs/common';
import { Order } from '../../domain/entities/order.entity';
import { OrderNotFoundException } from '../../domain/exceptions/order-not-found.exception';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';

export interface GetMyOrderCommand {
  orderId: string;
  customerId: string;
}

@Injectable()
export class GetMyOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
  ) {}

  async execute(cmd: GetMyOrderCommand): Promise<Order> {
    const order = await this.orders.findByIdForCustomer(
      cmd.orderId,
      cmd.customerId,
    );
    if (!order) throw new OrderNotFoundException();
    return order;
  }
}
