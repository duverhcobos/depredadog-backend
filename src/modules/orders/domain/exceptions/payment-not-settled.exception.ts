import { DomainException } from '../../../../common/exceptions/domain.exception';

// 409: no se entrega sin cobrar — 'done' exige payment.status='paid'.
// En cash el dueño primero marca el cobro con confirm-payment.
export class PaymentNotSettledException extends DomainException {
  constructor() {
    super('Order payment is not settled', 409, 'PAYMENT_NOT_SETTLED');
  }
}
