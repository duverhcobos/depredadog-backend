import { DomainException } from '../../../../common/exceptions/domain.exception';

export class GoogleAccountAlreadyLinkedException extends DomainException {
  constructor() {
    super('Google account is already linked to another user', 409);
  }
}
