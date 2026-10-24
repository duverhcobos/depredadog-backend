import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { User } from '../../domain/entities/user.entity';
import {
  DEVICE_REPOSITORY,
  type IDeviceRepository,
} from '../../domain/repositories/device.repository.interface';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  CODE_GENERATOR,
  type ICodeGenerator,
} from '../../domain/services/code-generator.interface';
import { IssuedTokens } from '../mappers/auth.mapper';

export interface IssuedSession extends IssuedTokens {
  user: User;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: IDeviceRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: IRefreshTokenRepository,
    @Inject(CODE_GENERATOR)
    private readonly codeGenerator: ICodeGenerator,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issue(
    user: User,
    deviceFingerprint?: string,
    platform?: string,
  ): Promise<IssuedSession> {
    let deviceId: string | null = null;
    if (deviceFingerprint) {
      const device = await this.devices.touch(
        user.id,
        deviceFingerprint,
        platform ?? null,
      );
      deviceId = device.id;
    }
    const { token, tokenHash } = this.codeGenerator.generateSessionToken();
    const refresh = new RefreshToken();
    refresh.userId = user.id;
    refresh.deviceId = deviceId;
    refresh.tokenHash = tokenHash;
    refresh.expiresAt = new Date(
      Date.now() +
        this.config.get<number>('auth.refreshTokenTtlDays')! * 86_400_000,
    );
    const saved = await this.refreshTokens.save(refresh);
    const accessToken = this.jwtService.sign({
      sub: user.id,
      sid: saved.id,
      email: user.email,
      role: user.role,
    });
    return { user, accessToken, refreshToken: token };
  }
}
