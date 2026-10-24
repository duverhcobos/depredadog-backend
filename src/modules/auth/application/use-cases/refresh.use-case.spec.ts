import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { CompromisedSessionException } from '../../domain/exceptions/compromised-session.exception';
import { InvalidRefreshTokenException } from '../../domain/exceptions/invalid-refresh-token.exception';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  CODE_GENERATOR,
  ICodeGenerator,
} from '../../domain/services/code-generator.interface';
import { RefreshUseCase } from './refresh.use-case';

describe('RefreshUseCase', () => {
  let useCase: RefreshUseCase;
  let refreshTokens: jest.Mocked<IRefreshTokenRepository>;
  let users: jest.Mocked<IUserRepository>;
  let codeGen: jest.Mocked<ICodeGenerator>;
  let jwt: jest.Mocked<JwtService>;
  let config: jest.Mocked<ConfigService>;

  const cmd = { refreshToken: 'opaque-token' };

  function liveToken(): RefreshToken {
    const t = new RefreshToken();
    t.id = 'rt-1';
    t.userId = 'u1';
    t.deviceId = 'dev-1';
    t.expiresAt = new Date(Date.now() + 86_400_000);
    return t;
  }

  beforeEach(async () => {
    refreshTokens = {
      save: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      revoke: jest.fn().mockResolvedValue(true),
      revokeAllForUser: jest.fn(),
    };
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      save: jest.fn(),
    };
    codeGen = {
      generateVerificationCode: jest.fn(),
      generateSessionToken: jest
        .fn()
        .mockReturnValue({ token: 'new-opaque', tokenHash: 'new-hash' }),
      generateReferralCode: jest.fn(),
      hashToken: jest.fn().mockReturnValue('hash-of-token'),
    };
    jwt = {
      sign: jest.fn().mockReturnValue('new-access'),
    } as unknown as jest.Mocked<JwtService>;
    config = {
      get: jest.fn().mockReturnValue(30),
    } as unknown as jest.Mocked<ConfigService>;
    refreshTokens.save.mockImplementation((t: RefreshToken) => {
      t.id = 'rt-2';
      return Promise.resolve(t);
    });

    const module = await Test.createTestingModule({
      providers: [
        RefreshUseCase,
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: refreshTokens },
        { provide: USER_REPOSITORY, useValue: users },
        { provide: CODE_GENERATOR, useValue: codeGen },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    useCase = module.get(RefreshUseCase);
  });

  it('rota el token y conserva el deviceId', async () => {
    refreshTokens.findByTokenHash.mockResolvedValue(liveToken());
    const u = new User();
    u.id = 'u1';
    u.status = UserStatus.ACTIVE;
    users.findById.mockResolvedValue(u);

    const result = await useCase.execute(cmd);

    expect(refreshTokens.findByTokenHash).toHaveBeenCalledWith('hash-of-token');
    expect(refreshTokens.revoke).toHaveBeenCalledWith('rt-1');
    const saved = refreshTokens.save.mock.calls[0][0];
    expect(saved.deviceId).toBe('dev-1');
    expect(saved.tokenHash).toBe('new-hash');
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1', sid: 'rt-2' }),
    );
    expect(result).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-opaque',
    });
  });

  it('rechaza token inexistente', async () => {
    refreshTokens.findByTokenHash.mockResolvedValue(null);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidRefreshTokenException,
    );
  });

  it('reuso de token revocado → revoca todas las sesiones', async () => {
    const t = liveToken();
    t.revokedAt = new Date();
    refreshTokens.findByTokenHash.mockResolvedValue(t);

    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      CompromisedSessionException,
    );
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    expect(refreshTokens.save).not.toHaveBeenCalled();
  });

  it('carrera de rotación (revoke sin filas afectadas) → sesión comprometida', async () => {
    refreshTokens.findByTokenHash.mockResolvedValue(liveToken());
    const u = new User();
    u.id = 'u1';
    u.status = UserStatus.ACTIVE;
    users.findById.mockResolvedValue(u);
    refreshTokens.revoke.mockResolvedValue(false);

    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      CompromisedSessionException,
    );
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    expect(refreshTokens.save).not.toHaveBeenCalled();
  });

  it('rechaza token expirado', async () => {
    const t = liveToken();
    t.expiresAt = new Date(Date.now() - 1000);
    refreshTokens.findByTokenHash.mockResolvedValue(t);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidRefreshTokenException,
    );
  });

  it('rechaza si el usuario ya no está activo', async () => {
    refreshTokens.findByTokenHash.mockResolvedValue(liveToken());
    const u = new User();
    u.status = UserStatus.SUSPENDED;
    users.findById.mockResolvedValue(u);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidRefreshTokenException,
    );
    expect(refreshTokens.revoke).not.toHaveBeenCalled();
  });
});
