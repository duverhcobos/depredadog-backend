import { DomainException } from '../../../../common/exceptions/domain.exception';

// 404 deliberado (no 403): una dirección ajena responde igual que una
// inexistente — no se revela que existe (idor-checklist).
export class AddressNotFoundException extends DomainException {
  constructor() {
    super('Address not found', 404, 'ADDRESS_NOT_FOUND');
  }
}
