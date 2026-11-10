import { DomainException } from '../../../../common/exceptions/domain.exception';

// El push no salió (celular sin cuenta, proveedor caído, timeout) —
// 502 porque es falla del upstream; la orden NO se crea: el cliente
// corrige el medio de pago y reintenta con el mismo clientRequestId
// sin dejar pedidos huérfanos.
export class PaymentDispatchFailedException extends DomainException {
  constructor(detail = 'Payment could not be dispatched') {
    super(detail, 502, 'PAYMENT_DISPATCH_FAILED');
  }
}
