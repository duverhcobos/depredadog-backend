import { Test } from '@nestjs/testing';
import { User } from '../../domain/entities/user.entity';
import { ReferralCodeGenerationException } from '../../domain/exceptions/referral-code-generation.exception';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  CODE_GENERATOR,
  ICodeGenerator,
} from '../../domain/services/code-generator.interface';
import { ReferralCodeService } from './referral-code.service';

describe('ReferralCodeService', () => {
  let service: ReferralCodeService;
  let users: jest.Mocked<IUserRepository>;
  let codeGen: jest.Mocked<ICodeGenerator>;

  beforeEach(async () => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      save: jest.fn(),
    };
    codeGen = {
      generateVerificationCode: jest.fn(),
      generateSessionToken: jest.fn(),
      generateReferralCode: jest.fn().mockReturnValue('ABC23456'),
      hashToken: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ReferralCodeService,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: CODE_GENERATOR, useValue: codeGen },
      ],
    }).compile();
    service = module.get(ReferralCodeService);
  });

  it('devuelve el primer código libre', async () => {
    users.findByReferralCode.mockResolvedValue(null);
    await expect(service.generate()).resolves.toBe('ABC23456');
  });

  it('reintenta cuando el código ya existe', async () => {
    codeGen.generateReferralCode
      .mockReturnValueOnce('TAKEN111')
      .mockReturnValueOnce('FREE2222');
    users.findByReferralCode
      .mockResolvedValueOnce(new User())
      .mockResolvedValue(null);
    await expect(service.generate()).resolves.toBe('FREE2222');
  });

  it('lanza excepción de dominio tras 5 intentos', async () => {
    users.findByReferralCode.mockResolvedValue(new User());
    await expect(service.generate()).rejects.toBeInstanceOf(
      ReferralCodeGenerationException,
    );
    expect(codeGen.generateReferralCode).toHaveBeenCalledTimes(5);
  });
});
