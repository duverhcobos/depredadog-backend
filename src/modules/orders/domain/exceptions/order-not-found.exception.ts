import { DomainException } from '../../../../common/exceptions/domain.exception';

// 404 deliberado (no 403): una orden ajena responde igual que una
// inexistente — no se revela que existe (idor-checklist).
export class OrderNotFoundException extends DomainException {
  constructor() {
    super('Order not found', 404, 'ORDER_NOT_FOUND');
  }
}
