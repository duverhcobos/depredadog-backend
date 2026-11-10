import { DomainException } from '../../../../common/exceptions/domain.exception';

// 409: la orden no tiene pago confirmable — sin payment, o el pago
// ya quedó failed/refunded (un 'paid' responde idempotente, no 409).
export class PaymentNotConfirmableException extends DomainException {
  constructor() {
    super('Payment cannot be confirmed', 409, 'PAYMENT_NOT_CONFIRMABLE');
  }
}
