import { DomainException } from '../../../../common/exceptions/domain.exception';

export class EmailAlreadyRegisteredException extends DomainException {
  constructor() {
    super('Email is already registered', 409, 'EMAIL_ALREADY_REGISTERED');
  }
}
