import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../../common/decorators/public.decorator';
import { OrdersService } from '../../application/services/orders.service';
import { PaymentWebhookDto } from '../../application/dtos/payment-webhook.dto';
import { OrderResponseDto } from '../../application/dtos/order-response.dto';

// El proveedor notifica el resultado del cobro acá — público porque
// Nequi no manda JWT de usuario; la autenticación es el secreto
// compartido x-webhook-secret (sim hoy; firma del proveedor con las
// llaves reales — pendiente 010). Throttle agresivo: endpoint público.
@Controller('payments')
export class PaymentsWebhookController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('webhook/:provider')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  resolve(
    @Param('provider') provider: string,
    @Headers('x-webhook-secret') secret: string | undefined,
    @Body() dto: PaymentWebhookDto,
  ): Promise<OrderResponseDto> {
    const expected = this.config.get<string>('payment.webhookSecret');
    if (!expected) {
      // Sin secreto configurado el endpoint no existe — evita dejar
      // una puerta abierta en un ambiente mal provisionado.
      throw new BadRequestException('Webhook is not configured');
    }
    // timingSafeEqual: comparación en tiempo constante — un secreto
    // compartido no se compara con !== (revisa M-3 de la auditoría).
    const provided = Buffer.from(secret ?? '', 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (
      provided.length !== expectedBuf.length ||
      !timingSafeEqual(provided, expectedBuf)
    ) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
    return this.ordersService.resolveWebhook(provider, dto);
  }
}
