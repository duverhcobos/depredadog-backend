import { Inject, Injectable } from '@nestjs/common';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import { UserStatus } from '../../domain/enums/user-status.enum';
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

export interface CheckResetCodeCommand {
  email: string;
  code: string;
}

/// Valida un código de reset SIN consumirlo — el paso intermedio del
/// wizard de recuperación ("se verifica" antes de pedir la clave).
/// ResetPasswordUseCase sigue siendo el único que consume el token;
/// si el código expira entre este chequeo y el reset, el reset falla
/// con el mismo 400 genérico y el flujo reintenta.
@Injectable()
export class CheckResetCodeUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(AUTH_TOKEN_REPOSITORY)
    private readonly authTokens: IAuthTokenRepository,
    @Inject(CODE_GENERATOR)
    private readonly codeGenerator: ICodeGenerator,
  ) {}

  async execute(cmd: CheckResetCodeCommand): Promise<void> {
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
  }
}
