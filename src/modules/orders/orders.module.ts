import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DayCloseSchema } from '../../infrastructure/database/schemas/day-close.schema';
import { OrderItemModifierSchema } from '../../infrastructure/database/schemas/order-item-modifier.schema';
import { OrderItemSchema } from '../../infrastructure/database/schemas/order-item.schema';
import { OrderSchema } from '../../infrastructure/database/schemas/order.schema';
import { PaymentSchema } from '../../infrastructure/database/schemas/payment.schema';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PaymentsModule } from '../payments/payments.module';
import { StoreModule } from '../store/store.module';
import { AdminOrdersController } from './presentation/controllers/admin-orders.controller';
import { OrdersController } from './presentation/controllers/orders.controller';
import { PaymentsWebhookController } from './presentation/controllers/payments-webhook.controller';
import { OrdersService } from './application/services/orders.service';
import { OrderMapper } from './application/mappers/order.mapper';
import { AdminTablesMapper } from './application/mappers/admin-tables.mapper';
import { CancelMyOrderUseCase } from './application/use-cases/cancel-my-order.use-case';
import { CloseDayUseCase } from './application/use-cases/close-day.use-case';
import { ConfirmOrderPaymentUseCase } from './application/use-cases/confirm-order-payment.use-case';
import { CreateInPersonOrderUseCase } from './application/use-cases/create-in-person-order.use-case';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { GetAdminOrderUseCase } from './application/use-cases/get-admin-order.use-case';
import { GetMyOrderUseCase } from './application/use-cases/get-my-order.use-case';
import { ListAdminOrdersUseCase } from './application/use-cases/list-admin-orders.use-case';
import { ListAdminTablesUseCase } from './application/use-cases/list-admin-tables.use-case';
import { ListMyOrdersUseCase } from './application/use-cases/list-my-orders.use-case';
import { PreviewDayCloseUseCase } from './application/use-cases/preview-day-close.use-case';
import { ResolveOrderPaymentUseCase } from './application/use-cases/resolve-order-payment.use-case';
import { UpdateOrderStatusUseCase } from './application/use-cases/update-order-status.use-case';
import { DAY_CLOSE_REPOSITORY } from './domain/repositories/day-close.repository.interface';
import { ORDER_REPOSITORY } from './domain/repositories/order.repository.interface';
import { OrderItemsBuilder } from './domain/services/order-items-builder.service';
import { DayCloseRepository } from './infrastructure/repositories/day-close.repository';
import { OrderRepository } from './infrastructure/repositories/order.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderSchema,
      OrderItemSchema,
      OrderItemModifierSchema,
      PaymentSchema,
      DayCloseSchema,
    ]),
    CatalogModule,
    StoreModule,
    AuthModule,
    PaymentsModule,
  ],
  controllers: [
    OrdersController,
    PaymentsWebhookController,
    AdminOrdersController,
  ],
  providers: [
    OrdersService,
    OrderMapper,
    AdminTablesMapper,
    CreateOrderUseCase,
    ListMyOrdersUseCase,
    GetMyOrderUseCase,
    CancelMyOrderUseCase,
    ResolveOrderPaymentUseCase,
    ListAdminOrdersUseCase,
    GetAdminOrderUseCase,
    UpdateOrderStatusUseCase,
    ConfirmOrderPaymentUseCase,
    CreateInPersonOrderUseCase,
    ListAdminTablesUseCase,
    PreviewDayCloseUseCase,
    CloseDayUseCase,
    OrderItemsBuilder,
    { provide: ORDER_REPOSITORY, useClass: OrderRepository },
    { provide: DAY_CLOSE_REPOSITORY, useClass: DayCloseRepository },
  ],
})
export class OrdersModule {}
