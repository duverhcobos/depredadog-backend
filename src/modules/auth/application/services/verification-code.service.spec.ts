import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../../../../common/logger/logger.service';
import { AuthToken } from '../../domain/entities/auth-token.entity';
import { User } from '../../domain/entities/user.entity';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import {
  AUTH_TOKEN_REPOSITORY,
  IAuthTokenRepository,
} from '../../domain/repositories/auth-token.repository.interface';
import {
  CODE_GENERATOR,
  ICodeGenerator,
} from '../../domain/services/code-generator.interface';
import {
  EMAIL_SENDER,
  IEmailSender,
} from '../../domain/services/email-sender.interface';
import { VerificationCodeService } from './verification-code.service';

describe('VerificationCodeService', () => {
  let authTokens: jest.Mocked<IAuthTokenRepository>;
  let codeGen: jest.Mocked<ICodeGenerator>;
  let emailSender: jest.Mocked<IEmailSender>;
  let logger: jest.Mocked<LoggerService>;
  let service: VerificationCodeService;

  beforeEach(async () => {
    authTokens = {
      save: jest.fn(),
      findValidByHash: jest.fn(),
      consume: jest.fn(),
      consumePendingForUser: jest.fn(),
    };
    codeGen = {
      generateVerificationCode: jest.fn().mockReturnValue('654321'),
      generateSessionToken: jest.fn(),
      generateReferralCode: jest.fn(),
      hashToken: jest.fn().mockReturnValue('sha256-of-654321'),
    };
    emailSender = {
      sendVerificationCode: jest.fn(),
      sendPasswordResetCode: jest.fn(),
    };
    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;
    const config = {
      get: jest.fn().mockReturnValue(15),
    } as unknown as jest.Mocked<ConfigService>;
    authTokens.save.mockImplementation((t: AuthToken) => Promise.resolve(t));

    const module = await Test.createTestingModule({
      providers: [
        VerificationCodeService,
        { provide: AUTH_TOKEN_REPOSITORY, useValue: authTokens },
        { provide: CODE_GENERATOR, useValue: codeGen },
        { provide: EMAIL_SENDER, useValue: emailSender },
        { provide: ConfigService, useValue: config },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();
    service = module.get(VerificationCodeService);
  });

  it('invalida códigos previos, guarda hash y envía el plano', async () => {
    const user = Object.assign(new User(), { id: 'u1', email: 'a@b.com' });
    await service.issue(user);

    expect(authTokens.consumePendingForUser).toHaveBeenCalledWith(
      'u1',
      AuthTokenType.EMAIL_VERIFICATION,
    );
    const saved = authTokens.save.mock.calls[0][0];
    expect(saved.tokenHash).toBe('sha256-of-654321');
    expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(emailSender.sendVerificationCode).toHaveBeenCalledWith(
      'a@b.com',
      '654321',
    );
  });

  it('issuePasswordReset consume previos del tipo y envía por el canal de reset', async () => {
    const user = Object.assign(new User(), { id: 'u1', email: 'a@b.com' });
    await service.issuePasswordReset(user);

    expect(authTokens.consumePendingForUser).toHaveBeenCalledWith(
      'u1',
      AuthTokenType.PASSWORD_RESET,
    );
    expect(emailSender.sendPasswordResetCode).toHaveBeenCalledWith(
      'a@b.com',
      '654321',
    );
  });

  it('traga el fallo del envío (token persistido, anti-enumeración)', async () => {
    emailSender.sendVerificationCode.mockRejectedValue(
      new Error('Email delivery failed: 403'),
    );
    const user = Object.assign(new User(), { id: 'u1', email: 'a@b.com' });

    await expect(service.issue(user)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
