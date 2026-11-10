import { Injectable } from '@nestjs/common';
import { CancelOrderDto } from '../dtos/cancel-order.dto';
import { CreateOrderDto } from '../dtos/create-order.dto';
import { ListOrdersQueryDto } from '../dtos/list-orders.query.dto';
import { PaymentWebhookDto } from '../dtos/payment-webhook.dto';
import {
  OrderListResponseDto,
  OrderResponseDto,
} from '../dtos/order-response.dto';
import { OrderMapper } from '../mappers/order.mapper';
import { CancelMyOrderUseCase } from '../use-cases/cancel-my-order.use-case';
import { CreateOrderUseCase } from '../use-cases/create-order.use-case';
import { GetMyOrderUseCase } from '../use-cases/get-my-order.use-case';
import { ListMyOrdersUseCase } from '../use-cases/list-my-orders.use-case';
import { ResolveOrderPaymentUseCase } from '../use-cases/resolve-order-payment.use-case';

@Injectable()
export class OrdersService {
  constructor(
    private readonly createOrder: CreateOrderUseCase,
    private readonly listMyOrders: ListMyOrdersUseCase,
    private readonly getMyOrder: GetMyOrderUseCase,
    private readonly cancelMyOrder: CancelMyOrderUseCase,
    private readonly resolveOrderPayment: ResolveOrderPaymentUseCase,
    private readonly mapper: OrderMapper,
  ) {}

  async create(userId: string, dto: CreateOrderDto): Promise<OrderResponseDto> {
    const order = await this.createOrder.execute({
      customerId: userId,
      ...dto,
    });
    return this.mapper.toResponse(order);
  }

  async list(
    userId: string,
    q: ListOrdersQueryDto,
  ): Promise<OrderListResponseDto> {
    const page = await this.listMyOrders.execute({
      customerId: userId,
      bucket: q.bucket,
      page: q.page,
      limit: q.limit,
    });
    return this.mapper.toListResponse(page, q.page, q.limit);
  }

  async detail(userId: string, orderId: string): Promise<OrderResponseDto> {
    const order = await this.getMyOrder.execute({
      customerId: userId,
      orderId,
    });
    return this.mapper.toResponse(order);
  }

  async cancel(
    userId: string,
    orderId: string,
    dto: CancelOrderDto,
  ): Promise<OrderResponseDto> {
    const order = await this.cancelMyOrder.execute({
      customerId: userId,
      orderId,
      reason: dto.reason,
    });
    return this.mapper.toResponse(order);
  }

  async resolveWebhook(
    provider: string,
    dto: PaymentWebhookDto,
  ): Promise<OrderResponseDto> {
    const order = await this.resolveOrderPayment.execute({
      provider,
      reference: dto.reference,
      status: dto.status,
      payload: dto.payload,
    });
    return this.mapper.toResponse(order);
  }
}
