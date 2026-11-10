import { DomainException } from '../../../../common/exceptions/domain.exception';

export class AddressLimitReachedException extends DomainException {
  constructor() {
    super('Address limit reached (10 per user)', 409, 'ADDRESS_LIMIT_REACHED');
  }
}
