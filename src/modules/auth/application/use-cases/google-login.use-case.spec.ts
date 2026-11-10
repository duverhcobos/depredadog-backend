import { Test } from '@nestjs/testing';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { UserSuspendedException } from '../../domain/exceptions/user-suspended.exception';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  GOOGLE_TOKEN_VERIFIER,
  GoogleProfile,
  IGoogleTokenVerifier,
} from '../../domain/services/google-token-verifier.interface';
import { ReferralCodeService } from '../services/referral-code.service';
import { SessionService } from '../services/session.service';
import { GoogleLoginUseCase } from './google-login.use-case';

describe('GoogleLoginUseCase', () => {
  let useCase: GoogleLoginUseCase;
  let users: jest.Mocked<IUserRepository>;
  let verifier: jest.Mocked<IGoogleTokenVerifier>;
  let referralCodes: jest.Mocked<ReferralCodeService>;
  let session: jest.Mocked<SessionService>;

  const profile: GoogleProfile = {
    googleId: 'g-123',
    email: 'Nuevo@Gmail.com',
    givenName: 'Ana',
    familyName: 'Pérez',
  };

  beforeEach(async () => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      findNamesByIds: jest.fn(),
      save: jest.fn(),
    };
    verifier = { verify: jest.fn().mockResolvedValue(profile) };
    referralCodes = {
      generate: jest.fn().mockResolvedValue('REF12345'),
    } as unknown as jest.Mocked<ReferralCodeService>;
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
        GoogleLoginUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: GOOGLE_TOKEN_VERIFIER, useValue: verifier },
        { provide: ReferralCodeService, useValue: referralCodes },
        { provide: SessionService, useValue: session },
      ],
    }).compile();
    useCase = module.get(GoogleLoginUseCase);
  });

  it('usuario nuevo → crea cuenta active con googleId y referralCode', async () => {
    users.findByGoogleId.mockResolvedValue(null);
    users.findByEmail.mockResolvedValue(null);

    const result = await useCase.execute({ idToken: 'tok' });

    const saved = users.save.mock.calls[0][0];
    expect(saved.email).toBe('nuevo@gmail.com');
    expect(saved.googleId).toBe('g-123');
    expect(saved.passwordHash).toBeNull();
    expect(saved.status).toBe(UserStatus.ACTIVE);
    expect(saved.firstName).toBe('Ana');
    expect(saved.firstLastName).toBe('Pérez');
    expect(saved.secondName).toBeNull();
    expect(saved.secondLastName).toBeNull();
    expect(saved.referralCode).toBe('REF12345');
    expect(result.accessToken).toBe('at');
  });

  it('trunca givenName/familyName a 100 chars (límite de columna)', async () => {
    verifier.verify.mockResolvedValue({
      ...profile,
      givenName: 'X'.repeat(150),
      familyName: 'Y'.repeat(150),
    });
    users.findByGoogleId.mockResolvedValue(null);
    users.findByEmail.mockResolvedValue(null);

    await useCase.execute({ idToken: 'tok' });

    const saved = users.save.mock.calls[0][0];
    expect(saved.firstName).toHaveLength(100);
    expect(saved.firstLastName).toHaveLength(100);
  });

  it('sin familyName de Google → firstLastName queda vacío', async () => {
    verifier.verify.mockResolvedValue({ ...profile, familyName: null });
    users.findByGoogleId.mockResolvedValue(null);
    users.findByEmail.mockResolvedValue(null);

    await useCase.execute({ idToken: 'tok' });

    const saved = users.save.mock.calls[0][0];
    expect(saved.firstLastName).toBe('');
  });

  it('encuentra por googleId → login directo sin tocar la fila', async () => {
    const u = Object.assign(new User(), {
      googleId: 'g-123',
      status: UserStatus.ACTIVE,
    });
    users.findByGoogleId.mockResolvedValue(u);

    await useCase.execute({ idToken: 'tok' });

    expect(users.findByEmail).not.toHaveBeenCalled();
    expect(users.save).not.toHaveBeenCalled();
    expect(session.issue).toHaveBeenCalledWith(u, undefined, undefined);
  });

  it('encuentra por email sin googleId → vincula la cuenta', async () => {
    users.findByGoogleId.mockResolvedValue(null);
    const u = Object.assign(new User(), {
      googleId: null,
      status: UserStatus.ACTIVE,
    });
    users.findByEmail.mockResolvedValue(u);

    await useCase.execute({ idToken: 'tok' });

    expect(users.save.mock.calls[0][0].googleId).toBe('g-123');
  });

  it('pendiente de verificación → activa (email probado por Google)', async () => {
    users.findByGoogleId.mockResolvedValue(null);
    const u = Object.assign(new User(), {
      googleId: null,
      status: UserStatus.PENDING_VERIFICATION,
      emailVerifiedAt: null,
    });
    users.findByEmail.mockResolvedValue(u);

    await useCase.execute({ idToken: 'tok' });

    const saved = users.save.mock.calls[0][0];
    expect(saved.status).toBe(UserStatus.ACTIVE);
    expect(saved.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('suspendido → 403', async () => {
    users.findByGoogleId.mockResolvedValue(
      Object.assign(new User(), { status: UserStatus.SUSPENDED }),
    );
    await expect(useCase.execute({ idToken: 'tok' })).rejects.toBeInstanceOf(
      UserSuspendedException,
    );
    expect(session.issue).not.toHaveBeenCalled();
  });
});
