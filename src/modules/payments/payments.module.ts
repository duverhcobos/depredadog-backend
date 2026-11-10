import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYMENT_GATEWAY } from './domain/services/payment-gateway.interface';
import { SimulatedPaymentGateway } from './infrastructure/gateways/simulated-payment.gateway';

// Hoja de integración de pagos — exporta solo el puerto. El driver se
// lee de payment.driver ('sim' dev; 'nequi' con las llaves QA —
// pendiente 010: el swap es agregar el case acá, no código de
// negocio). Driver desconocido = provisión rota → falla en el
// arranque, no en el primer cobro.
@Module({
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('payment.driver') ?? 'sim';
        switch (driver) {
          case 'sim':
            return new SimulatedPaymentGateway();
          default:
            throw new Error(`Unknown payment gateway driver: ${driver}`);
        }
      },
    },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentsModule {}
