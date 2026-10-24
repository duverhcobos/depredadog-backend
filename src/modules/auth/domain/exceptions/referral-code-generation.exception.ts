import { DomainException } from '../../../../common/exceptions/domain.exception';

export class ReferralCodeGenerationException extends DomainException {
  constructor() {
    super('Could not generate a unique referral code', 500);
  }
}
