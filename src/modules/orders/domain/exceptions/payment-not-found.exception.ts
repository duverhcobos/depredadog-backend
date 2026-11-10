import { DomainException } from '../../../../common/exceptions/domain.exception';

// Webhook con provider_reference desconocida — 404, no 200: el
// proveedor debe saber que esa referencia no existe acá (nunca se
// despachó o llegó con el provider equivocado).
export class PaymentNotFoundException extends DomainException {
  constructor() {
    super('Payment not found', 404, 'PAYMENT_NOT_FOUND');
  }
}
