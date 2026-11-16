import { Injectable } from '@nestjs/common';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import {
  AdminOrderListResponseDto,
  AdminOrderResponseDto,
} from '../dtos/admin-order-response.dto';
import { AdminTablesResponseDto } from '../dtos/admin-tables.response.dto';
import { CancelOrderDto } from '../dtos/cancel-order.dto';
import { CloseDayDto } from '../dtos/close-day.dto';
import { CreateInPersonOrderDto } from '../dtos/create-in-person-order.dto';
import { CreateOrderDto } from '../dtos/create-order.dto';
import {
  DayClosePreviewResponseDto,
  DayCloseResponseDto,
} from '../dtos/day-close.response.dto';
import { ListAdminOrdersQueryDto } from '../dtos/list-admin-orders.query.dto';
import { ListOrdersQueryDto } from '../dtos/list-orders.query.dto';
import { PaymentWebhookDto } from '../dtos/payment-webhook.dto';
import {
  OrderListResponseDto,
  OrderResponseDto,
} from '../dtos/order-response.dto';
import { UpdateOrderStatusDto } from '../dtos/update-order-status.dto';
import { AdminTablesMapper } from '../mappers/admin-tables.mapper';
import { OrderMapper } from '../mappers/order.mapper';
import { CancelMyOrderUseCase } from '../use-cases/cancel-my-order.use-case';
import { CloseDayUseCase } from '../use-cases/close-day.use-case';
import { ConfirmOrderPaymentUseCase } from '../use-cases/confirm-order-payment.use-case';
import { CreateInPersonOrderUseCase } from '../use-cases/create-in-person-order.use-case';
import { CreateOrderUseCase } from '../use-cases/create-order.use-case';
import { GetAdminOrderUseCase } from '../use-cases/get-admin-order.use-case';
import { GetMyOrderUseCase } from '../use-cases/get-my-order.use-case';
import { ListAdminOrdersUseCase } from '../use-cases/list-admin-orders.use-case';
import { ListAdminTablesUseCase } from '../use-cases/list-admin-tables.use-case';
import { ListMyOrdersUseCase } from '../use-cases/list-my-orders.use-case';
import { PreviewDayCloseUseCase } from '../use-cases/preview-day-close.use-case';
import { ResolveOrderPaymentUseCase } from '../use-cases/resolve-order-payment.use-case';
import { UpdateOrderStatusUseCase } from '../use-cases/update-order-status.use-case';

@Injectable()
export class OrdersService {
  constructor(
    private readonly createOrder: CreateOrderUseCase,
    private readonly listMyOrders: ListMyOrdersUseCase,
    private readonly getMyOrder: GetMyOrderUseCase,
    private readonly cancelMyOrder: CancelMyOrderUseCase,
    private readonly resolveOrderPayment: ResolveOrderPaymentUseCase,
    private readonly listAdminOrders: ListAdminOrdersUseCase,
    private readonly getAdminOrderUseCase: GetAdminOrderUseCase,
    private readonly updateOrderStatus: UpdateOrderStatusUseCase,
    private readonly confirmOrderPayment: ConfirmOrderPaymentUseCase,
    private readonly createInPersonOrder: CreateInPersonOrderUseCase,
    private readonly listAdminTables: ListAdminTablesUseCase,
    private readonly previewDayCloseUseCase: PreviewDayCloseUseCase,
    private readonly closeDayUseCase: CloseDayUseCase,
    private readonly mapper: OrderMapper,
    private readonly tablesMapper: AdminTablesMapper,
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

  // --- Endpoints del dueño (/admin/*) ---
  // Misma orquestación que el lado cliente: use-case → entidad +
  // contexto, mapper → DTO (strict-layering-rule).

  async listAdmin(
    q: ListAdminOrdersQueryDto,
  ): Promise<AdminOrderListResponseDto> {
    const result = await this.listAdminOrders.execute({
      bucket: q.bucket,
      page: q.page,
      limit: q.limit,
    });
    return this.mapper.toAdminListResponse(result, q.page, q.limit);
  }

  async getAdminOrder(orderId: string): Promise<AdminOrderResponseDto> {
    const result = await this.getAdminOrderUseCase.execute({ orderId });
    return this.mapper.toAdminResponse(result);
  }

  async updateStatus(
    orderId: string,
    dto: UpdateOrderStatusDto,
  ): Promise<AdminOrderResponseDto> {
    const result = await this.updateOrderStatus.execute({
      orderId,
      to: dto.to as OrderStatus,
      cancelReason: dto.cancelReason,
    });
    return this.mapper.toAdminResponse(result);
  }

  async confirmPayment(
    orderId: string,
    adminId: string,
  ): Promise<AdminOrderResponseDto> {
    const result = await this.confirmOrderPayment.execute({
      orderId,
      adminId,
    });
    return this.mapper.toAdminResponse(result);
  }

  async createInPerson(
    adminId: string,
    dto: CreateInPersonOrderDto,
  ): Promise<AdminOrderResponseDto> {
    const result = await this.createInPersonOrder.execute({
      adminId,
      ...dto,
    });
    return this.mapper.toAdminResponse(result);
  }

  // El preview es solo lectura — el guard ya validó el rol; no hay
  // nada del admin que registrar todavía (eso lo hace el cierre).
  async previewDayClose(): Promise<DayClosePreviewResponseDto> {
    const summary = await this.previewDayCloseUseCase.execute();
    return this.mapper.toDayClosePreviewResponse(summary);
  }

  async closeDay(
    adminId: string,
    dto: CloseDayDto,
  ): Promise<DayCloseResponseDto> {
    const result = await this.closeDayUseCase.execute({
      adminId,
      note: dto.note,
    });
    return this.mapper.toDayCloseResponse(result);
  }

  async listTables(): Promise<AdminTablesResponseDto> {
    const result = await this.listAdminTables.execute();
    return this.tablesMapper.toTablesResponse(
      result.tables,
      result.activeByTable,
    );
  }
}
