import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { CompromisedSessionException } from '../../domain/exceptions/compromised-session.exception';
import { InvalidRefreshTokenException } from '../../domain/exceptions/invalid-refresh-token.exception';
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
import { IssuedTokens } from '../mappers/auth.mapper';

export interface RefreshCommand {
  refreshToken: string;
}

@Injectable()
export class RefreshUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: IRefreshTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(CODE_GENERATOR)
    private readonly codeGenerator: ICodeGenerator,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async execute(cmd: RefreshCommand): Promise<IssuedTokens> {
    const existing = await this.refreshTokens.findByTokenHash(
      this.codeGenerator.hashToken(cmd.refreshToken),
    );
    if (!existing) throw new InvalidRefreshTokenException();
    if (existing.revokedAt) {
      // Reuso de token ya rotado = posible robo → matar todas las sesiones
      await this.refreshTokens.revokeAllForUser(existing.userId);
      throw new CompromisedSessionException();
    }
    if (existing.expiresAt.getTime() < Date.now()) {
      throw new InvalidRefreshTokenException();
    }
    const user = await this.users.findById(existing.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new InvalidRefreshTokenException();
    }

    const rotated = await this.refreshTokens.revoke(existing.id);
    if (!rotated) {
      // UPDATE condicional no afectó filas: otro request rotó el token primero
      // (reuso concurrente) → misma regla que presentar un token ya revocado
      await this.refreshTokens.revokeAllForUser(existing.userId);
      throw new CompromisedSessionException();
    }
    const { token, tokenHash } = this.codeGenerator.generateSessionToken();
    const next = new RefreshToken();
    next.userId = user.id;
    next.deviceId = existing.deviceId;
    next.tokenHash = tokenHash;
    next.expiresAt = new Date(
      Date.now() +
        this.config.get<number>('auth.refreshTokenTtlDays')! * 86_400_000,
    );
    const saved = await this.refreshTokens.save(next);
    const accessToken = this.jwtService.sign({
      sub: user.id,
      sid: saved.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken, refreshToken: token };
  }
}
