import { DomainException } from '../../../../common/exceptions/domain.exception';

export class MinOrderAmountException extends DomainException {
  constructor(min: number) {
    super(`Delivery orders require a minimum of ${min}`, 409, 'MIN_ORDER_AMOUNT');
  }
}
