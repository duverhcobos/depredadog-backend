import { Inject, Injectable } from '@nestjs/common';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import { InvalidAuthCodeException } from '../../domain/exceptions/invalid-auth-code.exception';
import {
  AUTH_TOKEN_REPOSITORY,
  type IAuthTokenRepository,
} from '../../domain/repositories/auth-token.repository.interface';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  CODE_GENERATOR,
  type ICodeGenerator,
} from '../../domain/services/code-generator.interface';
import { IssuedSession, SessionService } from '../services/session.service';

export interface VerifyEmailCommand {
  email: string;
  code: string;
  deviceFingerprint?: string;
  platform?: string;
}

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(AUTH_TOKEN_REPOSITORY)
    private readonly authTokens: IAuthTokenRepository,
    @Inject(CODE_GENERATOR)
    private readonly codeGenerator: ICodeGenerator,
    private readonly sessionService: SessionService,
  ) {}

  async execute(cmd: VerifyEmailCommand): Promise<IssuedSession> {
    const user = await this.users.findByEmail(cmd.email.trim().toLowerCase());
    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) {
      throw new InvalidAuthCodeException();
    }
    const token = await this.authTokens.findValidByHash(
      this.codeGenerator.hashToken(cmd.code),
      AuthTokenType.EMAIL_VERIFICATION,
    );
    if (
      !token ||
      token.userId !== user.id ||
      token.expiresAt.getTime() < Date.now()
    ) {
      throw new InvalidAuthCodeException();
    }
    const consumed = await this.authTokens.consume(token.id);
    if (!consumed) throw new InvalidAuthCodeException();
    user.status = UserStatus.ACTIVE;
    user.emailVerifiedAt = new Date();
    const saved = await this.users.save(user);
    return this.sessionService.issue(
      saved,
      cmd.deviceFingerprint,
      cmd.platform,
    );
  }
}
