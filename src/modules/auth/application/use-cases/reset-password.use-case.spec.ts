import { Test } from '@nestjs/testing';
import { AuthToken } from '../../domain/entities/auth-token.entity';
import { User } from '../../domain/entities/user.entity';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { InvalidAuthCodeException } from '../../domain/exceptions/invalid-auth-code.exception';
import {
  AUTH_TOKEN_REPOSITORY,
  IAuthTokenRepository,
} from '../../domain/repositories/auth-token.repository.interface';
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
import {
  IPasswordHasher,
  PASSWORD_HASHER,
} from '../../domain/services/password-hasher.interface';
import { SessionService } from '../services/session.service';
import { ResetPasswordUseCase } from './reset-password.use-case';

describe('ResetPasswordUseCase', () => {
  let useCase: ResetPasswordUseCase;
  let users: jest.Mocked<IUserRepository>;
  let authTokens: jest.Mocked<IAuthTokenRepository>;
  let refreshTokens: jest.Mocked<IRefreshTokenRepository>;
  let codeGen: jest.Mocked<ICodeGenerator>;
  let hasher: jest.Mocked<IPasswordHasher>;
  let session: jest.Mocked<SessionService>;

  const cmd = { email: 'a@b.com', code: '654321', newPassword: 'Nueva123!' };

  function activeUser(): User {
    const u = new User();
    u.id = 'u1';
    u.status = UserStatus.ACTIVE;
    return u;
  }

  function validToken(): AuthToken {
    const t = new AuthToken();
    t.id = 'tok-1';
    t.userId = 'u1';
    t.expiresAt = new Date(Date.now() + 60_000);
    return t;
  }

  beforeEach(async () => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      findNamesByIds: jest.fn(),
      save: jest.fn(),
    };
    authTokens = {
      save: jest.fn(),
      findValidByHash: jest.fn(),
      consume: jest.fn().mockResolvedValue(true),
      consumePendingForUser: jest.fn(),
    };
    refreshTokens = {
      save: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    codeGen = {
      generateVerificationCode: jest.fn(),
      generateSessionToken: jest.fn(),
      generateReferralCode: jest.fn(),
      hashToken: jest.fn().mockReturnValue('sha256-of-code'),
    };
    hasher = {
      hash: jest.fn().mockResolvedValue('new-bcrypt'),
      verify: jest.fn(),
    };
    session = {
      issue: jest
        .fn()
        .mockImplementation((u: User) =>
          Promise.resolve({ user: u, accessToken: 'at', refreshToken: 'rt' }),
        ),
    } as unknown as jest.Mocked<SessionService>;
    users.save.mockImplementation((u: User) => Promise.resolve(u));

    const module = await Test.createTestingModule({
      providers: [
        ResetPasswordUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: AUTH_TOKEN_REPOSITORY, useValue: authTokens },
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: refreshTokens },
        { provide: CODE_GENERATOR, useValue: codeGen },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: SessionService, useValue: session },
      ],
    }).compile();
    useCase = module.get(ResetPasswordUseCase);
  });

  it('resetea password, revoca sesiones previas y emite sesión nueva', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    authTokens.findValidByHash.mockResolvedValue(validToken());

    const result = await useCase.execute(cmd);

    expect(authTokens.findValidByHash).toHaveBeenCalledWith(
      'sha256-of-code',
      AuthTokenType.PASSWORD_RESET,
    );
    expect(hasher.hash).toHaveBeenCalledWith('Nueva123!');
    expect(users.save.mock.calls[0][0].passwordHash).toBe('new-bcrypt');
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    expect(result.accessToken).toBe('at');
  });

  it('activa un usuario pending tras el reset (posesión de email probada)', async () => {
    const u = activeUser();
    u.status = UserStatus.PENDING_VERIFICATION;
    u.emailVerifiedAt = null;
    users.findByEmail.mockResolvedValue(u);
    authTokens.findValidByHash.mockResolvedValue(validToken());

    await useCase.execute(cmd);

    const saved = users.save.mock.calls[0][0];
    expect(saved.status).toBe(UserStatus.ACTIVE);
    expect(saved.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('rechaza email inexistente', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
    expect(authTokens.findValidByHash).not.toHaveBeenCalled();
  });

  it('rechaza token de otro usuario', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    const t = validToken();
    t.userId = 'otro';
    authTokens.findValidByHash.mockResolvedValue(t);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
  });

  it('rechaza token expirado', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    const t = validToken();
    t.expiresAt = new Date(Date.now() - 1000);
    authTokens.findValidByHash.mockResolvedValue(t);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
  });

  it('rechaza usuario suspendido', async () => {
    const u = activeUser();
    u.status = UserStatus.SUSPENDED;
    users.findByEmail.mockResolvedValue(u);
    authTokens.findValidByHash.mockResolvedValue(validToken());
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
  });

  it('rechaza si consume no afecta filas (carrera)', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    authTokens.findValidByHash.mockResolvedValue(validToken());
    authTokens.consume.mockResolvedValue(false);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
    expect(users.save).not.toHaveBeenCalled();
  });
});
