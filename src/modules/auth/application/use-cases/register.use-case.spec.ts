import { Test } from '@nestjs/testing';
import { Device } from '../../domain/entities/device.entity';
import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyRegisteredException } from '../../domain/exceptions/email-already-registered.exception';
import { InvalidReferralCodeException } from '../../domain/exceptions/invalid-referral-code.exception';
import {
  DEVICE_REPOSITORY,
  IDeviceRepository,
} from '../../domain/repositories/device.repository.interface';
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
import { VerificationCodeService } from '../services/verification-code.service';
import { RegisterCommand, RegisterUseCase } from './register.use-case';

describe('RegisterUseCase', () => {
  let useCase: RegisterUseCase;
  let users: jest.Mocked<IUserRepository>;
  let devices: jest.Mocked<IDeviceRepository>;
  let hasher: jest.Mocked<IPasswordHasher>;
  let codeGen: jest.Mocked<ICodeGenerator>;
  let verificationCode: jest.Mocked<VerificationCodeService>;

  const command: RegisterCommand = {
    email: 'New@Test.com ',
    password: 'Password1!',
    firstName: ' Nuevo ',
    registeredIp: '1.2.3.4',
  };

  beforeEach(async () => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      save: jest.fn(),
    };
    devices = { findByUserAndFingerprint: jest.fn(), touch: jest.fn() };
    hasher = { hash: jest.fn(), verify: jest.fn() };
    codeGen = {
      generateVerificationCode: jest.fn(),
      generateSessionToken: jest.fn(),
      generateReferralCode: jest.fn(),
      hashToken: jest.fn(),
    };
    verificationCode = { issue: jest.fn() };

    hasher.hash.mockResolvedValue('bcrypt-hash');
    codeGen.generateReferralCode.mockReturnValue('ABCD2345');
    users.save.mockImplementation((u: User) => {
      u.id = 'user-1';
      return Promise.resolve(u);
    });

    const module = await Test.createTestingModule({
      providers: [
        RegisterUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: DEVICE_REPOSITORY, useValue: devices },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: CODE_GENERATOR, useValue: codeGen },
        { provide: VerificationCodeService, useValue: verificationCode },
      ],
    }).compile();
    useCase = module.get(RegisterUseCase);
  });

  it('crea el usuario normalizando email y emite código de verificación', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.findByReferralCode.mockResolvedValue(null);

    const user = await useCase.execute(command);

    expect(users.findByEmail).toHaveBeenCalledWith('new@test.com');
    expect(user.email).toBe('new@test.com');
    expect(user.firstName).toBe('Nuevo');
    expect(user.passwordHash).toBe('bcrypt-hash');
    expect(user.referralCode).toBe('ABCD2345');
    expect(user.registeredIp).toBe('1.2.3.4');
    expect(verificationCode.issue).toHaveBeenCalledWith(user);
    expect(devices.touch).not.toHaveBeenCalled();
  });

  it('rechaza email ya registrado', async () => {
    users.findByEmail.mockResolvedValue(new User());
    await expect(useCase.execute(command)).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredException,
    );
    expect(users.save).not.toHaveBeenCalled();
    expect(verificationCode.issue).not.toHaveBeenCalled();
  });

  it('rechaza referralCode inexistente', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.findByReferralCode.mockResolvedValue(null);
    await expect(
      useCase.execute({ ...command, referralCode: 'BADCODE1' }),
    ).rejects.toBeInstanceOf(InvalidReferralCodeException);
    expect(users.save).not.toHaveBeenCalled();
  });

  it('guarda referred_by con código válido', async () => {
    users.findByEmail.mockResolvedValue(null);
    const referrer = new User();
    referrer.id = 'referrer-1';
    users.findByReferralCode
      .mockResolvedValueOnce(referrer) // lookup del código recibido
      .mockResolvedValue(null); // el código propio generado queda libre

    const user = await useCase.execute({
      ...command,
      referralCode: 'abcd2345',
    });

    expect(users.findByReferralCode).toHaveBeenCalledWith('ABCD2345');
    expect(user.referredBy).toBe('referrer-1');
  });

  it('regenera referral_code si el primero está ocupado', async () => {
    users.findByEmail.mockResolvedValue(null);
    codeGen.generateReferralCode
      .mockReturnValueOnce('TAKEN001')
      .mockReturnValueOnce('FREE0002');
    users.findByReferralCode
      .mockResolvedValueOnce(new User()) // TAKEN001 ocupado
      .mockResolvedValueOnce(null); // FREE0002 libre

    const user = await useCase.execute(command);
    expect(user.referralCode).toBe('FREE0002');
  });

  it('hace touch del device cuando llega fingerprint', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.findByReferralCode.mockResolvedValue(null);
    const device = new Device();
    device.id = 'dev-1';
    devices.touch.mockResolvedValue(device);

    await useCase.execute({
      ...command,
      deviceFingerprint: 'fp-1',
      platform: 'android',
    });

    expect(devices.touch).toHaveBeenCalledWith('user-1', 'fp-1', 'android');
  });
});
