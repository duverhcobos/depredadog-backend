import { DomainException } from '../../../../common/exceptions/domain.exception';

export class UserSuspendedException extends DomainException {
  constructor() {
    super('Account is suspended', 403);
  }
}
