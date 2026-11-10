import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItemModifierSchema } from '../../infrastructure/database/schemas/order-item-modifier.schema';
import { OrderItemSchema } from '../../infrastructure/database/schemas/order-item.schema';
import { OrderSchema } from '../../infrastructure/database/schemas/order.schema';
import { PaymentSchema } from '../../infrastructure/database/schemas/payment.schema';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PaymentsModule } from '../payments/payments.module';
import { StoreModule } from '../store/store.module';
import { OrdersController } from './presentation/controllers/orders.controller';
import { PaymentsWebhookController } from './presentation/controllers/payments-webhook.controller';
import { OrdersService } from './application/services/orders.service';
import { OrderMapper } from './application/mappers/order.mapper';
import { CancelMyOrderUseCase } from './application/use-cases/cancel-my-order.use-case';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { GetMyOrderUseCase } from './application/use-cases/get-my-order.use-case';
import { ListMyOrdersUseCase } from './application/use-cases/list-my-orders.use-case';
import { ResolveOrderPaymentUseCase } from './application/use-cases/resolve-order-payment.use-case';
import { ORDER_REPOSITORY } from './domain/repositories/order.repository.interface';
import { OrderRepository } from './infrastructure/repositories/order.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderSchema,
      OrderItemSchema,
      OrderItemModifierSchema,
      PaymentSchema,
    ]),
    CatalogModule,
    StoreModule,
    AuthModule,
    PaymentsModule,
  ],
  controllers: [OrdersController, PaymentsWebhookController],
  providers: [
    OrdersService,
    OrderMapper,
    CreateOrderUseCase,
    ListMyOrdersUseCase,
    GetMyOrderUseCase,
    CancelMyOrderUseCase,
    ResolveOrderPaymentUseCase,
    { provide: ORDER_REPOSITORY, useClass: OrderRepository },
  ],
})
export class OrdersModule {}
