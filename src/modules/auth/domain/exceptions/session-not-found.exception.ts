import { DomainException } from '../../../../common/exceptions/domain.exception';

export class SessionNotFoundException extends DomainException {
  constructor() {
    super('Session is no longer valid', 401);
  }
}
