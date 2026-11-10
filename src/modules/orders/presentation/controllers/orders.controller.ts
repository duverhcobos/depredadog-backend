import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../../../common/decorators/current-user.decorator';
import { OrdersService } from '../../application/services/orders.service';
import { CancelOrderDto } from '../../application/dtos/cancel-order.dto';
import { CreateOrderDto } from '../../application/dtos/create-order.dto';
import { ListOrdersQueryDto } from '../../application/dtos/list-orders.query.dto';
import {
  OrderListResponseDto,
  OrderResponseDto,
} from '../../application/dtos/order-response.dto';

// Los 4 endpoints del cliente: crear con revalidación de catálogo
// server-side, mis pedidos por bucket, detalle del mío (IDOR-safe) y
// cancelación en pending. TODO recurso cuelga del JWT — nunca del :id.
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.create(user.userId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: ListOrdersQueryDto,
  ): Promise<OrderListResponseDto> {
    return this.ordersService.list(user.userId, q);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.detail(user.userId, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.cancel(user.userId, id, dto);
  }
}
