import { DomainException } from '../../../../common/exceptions/domain.exception';

export class OrderNotCancellableException extends DomainException {
  constructor() {
    super(
      'Order can only be cancelled while pending',
      409,
      'ORDER_NOT_CANCELLABLE',
    );
  }
}
