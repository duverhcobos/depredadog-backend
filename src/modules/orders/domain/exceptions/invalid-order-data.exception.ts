import { DomainException } from '../../../../common/exceptions/domain.exception';

// 400: combinación inválida (pickup+cash, transfer sin payerPhone,
// delivery sin dirección…)
export class InvalidOrderDataException extends DomainException {
  constructor(detail: string) {
    super(detail, 400, 'INVALID_ORDER_DATA');
  }
}
