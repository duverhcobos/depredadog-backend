import { Inject, Injectable } from '@nestjs/common';
import { ReferralCodeGenerationException } from '../../domain/exceptions/referral-code-generation.exception';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  CODE_GENERATOR,
  type ICodeGenerator,
} from '../../domain/services/code-generator.interface';

@Injectable()
export class ReferralCodeService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(CODE_GENERATOR)
    private readonly codeGenerator: ICodeGenerator,
  ) {}

  async generate(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = this.codeGenerator.generateReferralCode();
      if (!(await this.users.findByReferralCode(code))) return code;
    }
    throw new ReferralCodeGenerationException();
  }
}
