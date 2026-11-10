import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  type InitiatePushCommand,
  type IPaymentGateway,
  type PushDispatchResult,
} from '../../domain/services/payment-gateway.interface';

// Adapter dev — "despacha" el cobro logueándolo y devolviendo una
// referencia sim-<uuid>. La resolución se ejercita con el MISMO
// webhook real: POST /payments/webhook/sim { reference, status } con
// el secreto. Así el flujo pending→paid/failed se prueba de punta a
// punta sin tocar Nequi y el caso de certificación futuro usa el
// mismo camino de código.
@Injectable()
export class SimulatedPaymentGateway implements IPaymentGateway {
  private readonly logger = new Logger(SimulatedPaymentGateway.name);

  initiatePush(cmd: InitiatePushCommand): Promise<PushDispatchResult> {
    const reference = `sim-${randomUUID()}`;
    this.logger.log(
      `[SIM] push → ${cmd.payerPhone} por $${cmd.amount} ` +
        `(ref ${reference})`,
    );
    return Promise.resolve({ provider: 'sim', reference });
  }
}
