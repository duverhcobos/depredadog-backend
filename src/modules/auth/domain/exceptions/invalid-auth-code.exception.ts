import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidAuthCodeException extends DomainException {
  constructor() {
    super('Invalid or expired code', 400);
  }
}
