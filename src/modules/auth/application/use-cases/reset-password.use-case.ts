import { Inject, Injectable } from '@nestjs/common';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { InvalidAuthCodeException } from '../../domain/exceptions/invalid-auth-code.exception';
import {
  AUTH_TOKEN_REPOSITORY,
  type IAuthTokenRepository,
} from '../../domain/repositories/auth-token.repository.interface';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  CODE_GENERATOR,
  type ICodeGenerator,
} from '../../domain/services/code-generator.interface';
import {
  type IPasswordHasher,
  PASSWORD_HASHER,
} from '../../domain/services/password-hasher.interface';
import { IssuedSession, SessionService } from '../services/session.service';

export interface ResetPasswordCommand {
  email: string;
  code: string;
  newPassword: string;
  deviceFingerprint?: string;
  platform?: string;
}

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(AUTH_TOKEN_REPOSITORY)
    private readonly authTokens: IAuthTokenRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: IRefreshTokenRepository,
    @Inject(CODE_GENERATOR)
    private readonly codeGenerator: ICodeGenerator,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    private readonly sessionService: SessionService,
  ) {}

  async execute(cmd: ResetPasswordCommand): Promise<IssuedSession> {
    const user = await this.users.findByEmail(cmd.email.trim().toLowerCase());
    const token = user
      ? await this.authTokens.findValidByHash(
          this.codeGenerator.hashToken(cmd.code),
          AuthTokenType.PASSWORD_RESET,
        )
      : null;
    // Mismo 400 genérico para todos los fallos — no revelar qué falló
    if (
      !user ||
      user.status === UserStatus.SUSPENDED ||
      !token ||
      token.userId !== user.id ||
      token.expiresAt.getTime() < Date.now()
    ) {
      throw new InvalidAuthCodeException();
    }
    const consumed = await this.authTokens.consume(token.id);
    if (!consumed) throw new InvalidAuthCodeException();

    user.passwordHash = await this.passwordHasher.hash(cmd.newPassword);
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      // El código al email probó posesión del correo — misma regla que Google
      user.status = UserStatus.ACTIVE;
      user.emailVerifiedAt = user.emailVerifiedAt ?? new Date();
    }
    const saved = await this.users.save(user);
    // Seguridad post-cambio de credencial: todas las sesiones previas mueren
    await this.refreshTokens.revokeAllForUser(user.id);
    return this.sessionService.issue(
      saved,
      cmd.deviceFingerprint,
      cmd.platform,
    );
  }
}
