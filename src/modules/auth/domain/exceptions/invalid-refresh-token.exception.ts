import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidRefreshTokenException extends DomainException {
  constructor() {
    super('Invalid or expired session', 401, 'INVALID_REFRESH_TOKEN');
  }
}
