import { DomainException } from '../../../../common/exceptions/domain.exception';

export class StoreClosedException extends DomainException {
  constructor() {
    super('Store is closed', 409);
  }
}
