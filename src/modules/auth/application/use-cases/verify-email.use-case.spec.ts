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
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  CODE_GENERATOR,
  ICodeGenerator,
} from '../../domain/services/code-generator.interface';
import { SessionService } from '../services/session.service';
import { VerifyEmailUseCase } from './verify-email.use-case';

describe('VerifyEmailUseCase', () => {
  let useCase: VerifyEmailUseCase;
  let users: jest.Mocked<IUserRepository>;
  let authTokens: jest.Mocked<IAuthTokenRepository>;
  let codeGen: jest.Mocked<ICodeGenerator>;
  let session: jest.Mocked<SessionService>;

  const cmd = { email: 'a@b.com', code: '123456' };

  function pendingUser(): User {
    const u = new User();
    u.id = 'u1';
    u.status = UserStatus.PENDING_VERIFICATION;
    return u;
  }

  function validToken(userId: string): AuthToken {
    const t = new AuthToken();
    t.id = 'tok-1';
    t.userId = userId;
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
    codeGen = {
      generateVerificationCode: jest.fn(),
      generateSessionToken: jest.fn(),
      generateReferralCode: jest.fn(),
      hashToken: jest.fn().mockReturnValue('sha256-of-code'),
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
        VerifyEmailUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: AUTH_TOKEN_REPOSITORY, useValue: authTokens },
        { provide: CODE_GENERATOR, useValue: codeGen },
        { provide: SessionService, useValue: session },
      ],
    }).compile();
    useCase = module.get(VerifyEmailUseCase);
  });

  it('verifica, activa y emite sesión', async () => {
    users.findByEmail.mockResolvedValue(pendingUser());
    authTokens.findValidByHash.mockResolvedValue(validToken('u1'));

    const result = await useCase.execute(cmd);

    expect(authTokens.findValidByHash).toHaveBeenCalledWith(
      'sha256-of-code',
      AuthTokenType.EMAIL_VERIFICATION,
    );
    expect(authTokens.consume).toHaveBeenCalledWith('tok-1');
    const saved = users.save.mock.calls[0][0];
    expect(saved.status).toBe(UserStatus.ACTIVE);
    expect(saved.emailVerifiedAt).toBeInstanceOf(Date);
    expect(result.accessToken).toBe('at');
  });

  it('rechaza email inexistente', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
    expect(authTokens.findValidByHash).not.toHaveBeenCalled();
  });

  it('rechaza usuario ya activo', async () => {
    const u = pendingUser();
    u.status = UserStatus.ACTIVE;
    users.findByEmail.mockResolvedValue(u);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
  });

  it('rechaza token de otro usuario', async () => {
    users.findByEmail.mockResolvedValue(pendingUser());
    authTokens.findValidByHash.mockResolvedValue(validToken('otro'));
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
    expect(authTokens.consume).not.toHaveBeenCalled();
  });

  it('rechaza token expirado', async () => {
    users.findByEmail.mockResolvedValue(pendingUser());
    const t = validToken('u1');
    t.expiresAt = new Date(Date.now() - 1000);
    authTokens.findValidByHash.mockResolvedValue(t);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
  });

  it('rechaza cuando no hay token válido', async () => {
    users.findByEmail.mockResolvedValue(pendingUser());
    authTokens.findValidByHash.mockResolvedValue(null);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
  });

  it('rechaza si consume no afecta filas (carrera de consumo)', async () => {
    users.findByEmail.mockResolvedValue(pendingUser());
    authTokens.findValidByHash.mockResolvedValue(validToken('u1'));
    authTokens.consume.mockResolvedValue(false);

    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
    expect(users.save).not.toHaveBeenCalled();
    expect(session.issue).not.toHaveBeenCalled();
  });
});
