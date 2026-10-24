import { Test } from '@nestjs/testing';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { EmailNotVerifiedException } from '../../domain/exceptions/email-not-verified.exception';
import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';
import { UserSuspendedException } from '../../domain/exceptions/user-suspended.exception';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  IPasswordHasher,
  PASSWORD_HASHER,
} from '../../domain/services/password-hasher.interface';
import { SessionService } from '../services/session.service';
import { LoginUseCase } from './login.use-case';

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;
  let users: jest.Mocked<IUserRepository>;
  let hasher: jest.Mocked<IPasswordHasher>;
  let session: jest.Mocked<SessionService>;

  const cmd = { email: 'a@b.com', password: 'Password1!' };

  function activeUser(): User {
    const u = new User();
    u.status = UserStatus.ACTIVE;
    u.passwordHash = 'hash';
    return u;
  }

  beforeEach(async () => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      save: jest.fn(),
    };
    hasher = { hash: jest.fn(), verify: jest.fn() };
    session = {
      issue: jest
        .fn()
        .mockImplementation((u: User) =>
          Promise.resolve({ user: u, accessToken: 'at', refreshToken: 'rt' }),
        ),
    } as unknown as jest.Mocked<SessionService>;

    const module = await Test.createTestingModule({
      providers: [
        LoginUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: SessionService, useValue: session },
      ],
    }).compile();
    useCase = module.get(LoginUseCase);
  });

  it('emite sesión con credenciales válidas', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    hasher.verify.mockResolvedValue(true);
    const result = await useCase.execute(cmd);
    expect(result.accessToken).toBe('at');
    expect(session.issue).toHaveBeenCalled();
  });

  it('401 si el email no existe', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it('401 si la cuenta es solo-Google (sin passwordHash)', async () => {
    const u = activeUser();
    u.passwordHash = null;
    users.findByEmail.mockResolvedValue(u);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });

  it('401 si el password no coincide', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    hasher.verify.mockResolvedValue(false);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(session.issue).not.toHaveBeenCalled();
  });

  it('403 si el email no está verificado', async () => {
    const u = activeUser();
    u.status = UserStatus.PENDING_VERIFICATION;
    users.findByEmail.mockResolvedValue(u);
    hasher.verify.mockResolvedValue(true);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      EmailNotVerifiedException,
    );
    expect(session.issue).not.toHaveBeenCalled();
  });

  it('403 si la cuenta está suspendida', async () => {
    const u = activeUser();
    u.status = UserStatus.SUSPENDED;
    users.findByEmail.mockResolvedValue(u);
    hasher.verify.mockResolvedValue(true);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      UserSuspendedException,
    );
  });
});
