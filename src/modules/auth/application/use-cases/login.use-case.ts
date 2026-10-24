import { Inject, Injectable } from '@nestjs/common';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { EmailNotVerifiedException } from '../../domain/exceptions/email-not-verified.exception';
import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';
import { UserSuspendedException } from '../../domain/exceptions/user-suspended.exception';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  type IPasswordHasher,
  PASSWORD_HASHER,
} from '../../domain/services/password-hasher.interface';
import { IssuedSession, SessionService } from '../services/session.service';

export interface LoginCommand {
  email: string;
  password: string;
  deviceFingerprint?: string;
  platform?: string;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    private readonly sessionService: SessionService,
  ) {}

  async execute(cmd: LoginCommand): Promise<IssuedSession> {
    const user = await this.users.findByEmail(cmd.email.trim().toLowerCase());
    // Mismo 401 para email inexistente, cuenta solo-Google y password errado
    if (!user || !user.passwordHash) throw new InvalidCredentialsException();
    const valid = await this.passwordHasher.verify(
      user.passwordHash,
      cmd.password,
    );
    if (!valid) throw new InvalidCredentialsException();
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new EmailNotVerifiedException();
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UserSuspendedException();
    }
    return this.sessionService.issue(user, cmd.deviceFingerprint, cmd.platform);
  }
}
