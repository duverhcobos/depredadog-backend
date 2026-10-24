import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../../common/logger/logger.service';
import { AuthToken } from '../../domain/entities/auth-token.entity';
import { User } from '../../domain/entities/user.entity';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import {
  AUTH_TOKEN_REPOSITORY,
  type IAuthTokenRepository,
} from '../../domain/repositories/auth-token.repository.interface';
import {
  CODE_GENERATOR,
  type ICodeGenerator,
} from '../../domain/services/code-generator.interface';
import {
  EMAIL_SENDER,
  type IEmailSender,
} from '../../domain/services/email-sender.interface';

@Injectable()
export class VerificationCodeService {
  constructor(
    @Inject(AUTH_TOKEN_REPOSITORY)
    private readonly authTokens: IAuthTokenRepository,
    @Inject(CODE_GENERATOR)
    private readonly codeGenerator: ICodeGenerator,
    @Inject(EMAIL_SENDER)
    private readonly emailSender: IEmailSender,
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async issue(user: User): Promise<void> {
    const code = this.codeGenerator.generateVerificationCode();
    const token = new AuthToken();
    token.userId = user.id;
    token.type = AuthTokenType.EMAIL_VERIFICATION;
    token.tokenHash = this.codeGenerator.hashToken(code);
    token.expiresAt = new Date(
      Date.now() + this.config.get<number>('auth.codeTtlMinutes')! * 60_000,
    );
    await this.authTokens.consumePendingForUser(
      user.id,
      AuthTokenType.EMAIL_VERIFICATION,
    );
    await this.authTokens.save(token);
    // El envío es best-effort: el token queda persistido y el usuario puede
    // re-pedir el código por resend — no propagamos el fallo (además un 500
    // aquí revelaría que el email existe, rompiendo la anti-enumeración)
    try {
      await this.emailSender.sendVerificationCode(user.email, code);
    } catch (error) {
      this.logger.error(
        `Failed to send verification code to ${user.email}: ${(error as Error).message}`,
        undefined,
        'VerificationCodeService',
      );
    }
  }
}
