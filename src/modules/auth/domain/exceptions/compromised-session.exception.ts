import { DomainException } from '../../../../common/exceptions/domain.exception';

export class CompromisedSessionException extends DomainException {
  constructor() {
    super('Session expired, please log in again', 401);
  }
}
