import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidGoogleTokenException extends DomainException {
  constructor() {
    super('Invalid Google token', 401);
  }
}
