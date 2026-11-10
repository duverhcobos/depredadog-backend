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
import { CheckResetCodeUseCase } from './check-reset-code.use-case';

describe('CheckResetCodeUseCase', () => {
  let useCase: CheckResetCodeUseCase;
  let users: jest.Mocked<IUserRepository>;
  let authTokens: jest.Mocked<IAuthTokenRepository>;
  let codeGen: jest.Mocked<ICodeGenerator>;

  const cmd = { email: 'a@b.com', code: '654321' };

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
      consume: jest.fn(),
      consumePendingForUser: jest.fn(),
    };
    codeGen = {
      generateVerificationCode: jest.fn(),
      generateSessionToken: jest.fn(),
      generateReferralCode: jest.fn(),
      hashToken: jest.fn().mockReturnValue('sha256-of-code'),
    };

    const module = await Test.createTestingModule({
      providers: [
        CheckResetCodeUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: AUTH_TOKEN_REPOSITORY, useValue: authTokens },
        { provide: CODE_GENERATOR, useValue: codeGen },
      ],
    }).compile();
    useCase = module.get(CheckResetCodeUseCase);
  });

  it('valida el código y resuelve sin consumirlo', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    authTokens.findValidByHash.mockResolvedValue(validToken());

    await expect(useCase.execute(cmd)).resolves.toBeUndefined();

    expect(authTokens.findValidByHash).toHaveBeenCalledWith(
      'sha256-of-code',
      AuthTokenType.PASSWORD_RESET,
    );
    // La clave del endpoint: el código queda vivo para el reset real
    expect(authTokens.consume).not.toHaveBeenCalled();
  });

  it('rechaza email inexistente', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
    expect(authTokens.findValidByHash).not.toHaveBeenCalled();
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

  it('rechaza código errado', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    authTokens.findValidByHash.mockResolvedValue(null);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
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

  it('normaliza el email (trim + lowercase)', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    authTokens.findValidByHash.mockResolvedValue(validToken());

    await useCase.execute({ email: '  A@B.COM  ', code: '654321' });

    expect(users.findByEmail).toHaveBeenCalledWith('a@b.com');
  });
});
