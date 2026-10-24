import { Inject, Injectable } from '@nestjs/common';
import { UserStatus } from '../../domain/enums/user-status.enum';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { VerificationCodeService } from '../services/verification-code.service';

export interface ResendVerificationCommand {
  email: string;
}

@Injectable()
export class ResendVerificationUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly verificationCode: VerificationCodeService,
  ) {}

  async execute(cmd: ResendVerificationCommand): Promise<void> {
    const user = await this.users.findByEmail(cmd.email.trim().toLowerCase());
    // Anti-enumeración: silencio total si no existe o ya está verificado
    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) return;
    await this.verificationCode.issue(user);
  }
}
