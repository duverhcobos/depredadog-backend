import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import {
  AdminOrderListResponseDto,
  AdminOrderResponseDto,
} from '../../application/dtos/admin-order-response.dto';
import { AdminTablesResponseDto } from '../../application/dtos/admin-tables.response.dto';
import { CloseDayDto } from '../../application/dtos/close-day.dto';
import { CreateInPersonOrderDto } from '../../application/dtos/create-in-person-order.dto';
import {
  DayClosePreviewResponseDto,
  DayCloseResponseDto,
} from '../../application/dtos/day-close.response.dto';
import { ListAdminOrdersQueryDto } from '../../application/dtos/list-admin-orders.query.dto';
import { UpdateOrderStatusDto } from '../../application/dtos/update-order-status.dto';
import { OrdersService } from '../../application/services/orders.service';

// Panel del dueño — TODO cuelga de @Roles('admin'): el JWT ya trae
// role (session.service) y JwtAuthGuard global corre antes. RolesGuard
// no es APP_GUARD — se aplica explícito acá para no afectar los
// endpoints de cliente.
@Controller('admin')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('orders')
  listAdmin(
    @Query() q: ListAdminOrdersQueryDto,
  ): Promise<AdminOrderListResponseDto> {
    return this.ordersService.listAdmin(q);
  }

  @Patch('orders/:id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<AdminOrderResponseDto> {
    return this.ordersService.updateStatus(id, dto);
  }

  @Post('orders/:id/confirm-payment')
  @HttpCode(200)
  confirmPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminOrderResponseDto> {
    return this.ordersService.confirmPayment(id, user.userId);
  }

  @Post('orders')
  createInPerson(
    @Body() dto: CreateInPersonOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminOrderResponseDto> {
    return this.ordersService.createInPerson(user.userId, dto);
  }

  @Get('tables')
  listTables(): Promise<AdminTablesResponseDto> {
    return this.ordersService.listTables();
  }

  @Get('day-close')
  previewDayClose(): Promise<DayClosePreviewResponseDto> {
    return this.ordersService.previewDayClose();
  }

  @Post('day-close')
  @HttpCode(201)
  closeDay(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CloseDayDto,
  ): Promise<DayCloseResponseDto> {
    return this.ordersService.closeDay(user.userId, dto);
  }
}
