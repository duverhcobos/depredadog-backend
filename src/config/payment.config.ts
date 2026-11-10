import { registerAs } from '@nestjs/config';

// Integración de pagos. driver: 'sim' (dev — SimulatedPaymentGateway)
// o 'nequi' cuando lleguen las llaves QA (pendiente 010 — el swap es
// un binding en PaymentsModule). webhookSecret: compartido que
// autentica POST /payments/webhook/:provider vía x-webhook-secret;
// ausente → el endpoint responde 400 (puerta cerrada por defecto).
export default registerAs('payment', () => ({
  driver: process.env.PAYMENT_GATEWAY_DRIVER || 'sim',
  webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET,
}));
