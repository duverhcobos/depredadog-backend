import { Test } from '@nestjs/testing';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { VerificationCodeService } from '../services/verification-code.service';
import { ResendVerificationUseCase } from './resend-verification.use-case';

describe('ResendVerificationUseCase', () => {
  let useCase: ResendVerificationUseCase;
  let users: jest.Mocked<IUserRepository>;
  let verificationCode: jest.Mocked<VerificationCodeService>;

  beforeEach(async () => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      save: jest.fn(),
    };
    verificationCode = {
      issue: jest.fn(),
      issuePasswordReset: jest.fn(),
    } as unknown as jest.Mocked<VerificationCodeService>;

    const module = await Test.createTestingModule({
      providers: [
        ResendVerificationUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: VerificationCodeService, useValue: verificationCode },
      ],
    }).compile();
    useCase = module.get(ResendVerificationUseCase);
  });

  it('emite código nuevo si el usuario está pendiente', async () => {
    const u = new User();
    u.status = UserStatus.PENDING_VERIFICATION;
    users.findByEmail.mockResolvedValue(u);
    await useCase.execute({ email: 'a@b.com' });
    expect(verificationCode.issue).toHaveBeenCalledWith(u);
  });

  it('silencio si el email no existe (anti-enumeración)', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(
      useCase.execute({ email: 'ghost@b.com' }),
    ).resolves.toBeUndefined();
    expect(verificationCode.issue).not.toHaveBeenCalled();
  });

  it('silencio si el usuario ya está activo', async () => {
    const u = new User();
    u.status = UserStatus.ACTIVE;
    users.findByEmail.mockResolvedValue(u);
    await useCase.execute({ email: 'a@b.com' });
    expect(verificationCode.issue).not.toHaveBeenCalled();
  });
});
