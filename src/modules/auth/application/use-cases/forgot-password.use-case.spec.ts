import { Test } from '@nestjs/testing';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { VerificationCodeService } from '../services/verification-code.service';
import { ForgotPasswordUseCase } from './forgot-password.use-case';

describe('ForgotPasswordUseCase', () => {
  let useCase: ForgotPasswordUseCase;
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
        ForgotPasswordUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: VerificationCodeService, useValue: verificationCode },
      ],
    }).compile();
    useCase = module.get(ForgotPasswordUseCase);
  });

  it('emite código de reset para usuario activo', async () => {
    const u = Object.assign(new User(), { status: UserStatus.ACTIVE });
    users.findByEmail.mockResolvedValue(u);
    await useCase.execute({ email: 'A@B.com ' });
    expect(users.findByEmail).toHaveBeenCalledWith('a@b.com');
    expect(verificationCode.issuePasswordReset).toHaveBeenCalledWith(u);
  });

  it('emite código para cuenta solo-Google (sin passwordHash)', async () => {
    const u = Object.assign(new User(), {
      status: UserStatus.ACTIVE,
      passwordHash: null,
      googleId: 'g-1',
    });
    users.findByEmail.mockResolvedValue(u);
    await useCase.execute({ email: 'a@b.com' });
    expect(verificationCode.issuePasswordReset).toHaveBeenCalledWith(u);
  });

  it('silencia email inexistente (anti-enumeración)', async () => {
    users.findByEmail.mockResolvedValue(null);
    await useCase.execute({ email: 'a@b.com' });
    expect(verificationCode.issuePasswordReset).not.toHaveBeenCalled();
  });

  it('silencia usuario suspendido (anti-enumeración)', async () => {
    users.findByEmail.mockResolvedValue(
      Object.assign(new User(), { status: UserStatus.SUSPENDED }),
    );
    await useCase.execute({ email: 'a@b.com' });
    expect(verificationCode.issuePasswordReset).not.toHaveBeenCalled();
  });
});
