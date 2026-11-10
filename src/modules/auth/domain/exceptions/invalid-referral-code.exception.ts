import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidReferralCodeException extends DomainException {
  constructor() {
    super('Invalid referral code', 400, 'INVALID_REFERRAL_CODE');
  }
}
