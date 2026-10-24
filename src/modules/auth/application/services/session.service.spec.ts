import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Device } from '../../domain/entities/device.entity';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { User } from '../../domain/entities/user.entity';
import {
  DEVICE_REPOSITORY,
  IDeviceRepository,
} from '../../domain/repositories/device.repository.interface';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  CODE_GENERATOR,
  ICodeGenerator,
} from '../../domain/services/code-generator.interface';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;
  let devices: jest.Mocked<IDeviceRepository>;
  let refreshTokens: jest.Mocked<IRefreshTokenRepository>;
  let codeGen: jest.Mocked<ICodeGenerator>;
  let jwt: jest.Mocked<JwtService>;
  let config: jest.Mocked<ConfigService>;

  const user = Object.assign(new User(), {
    id: 'u1',
    email: 'a@b.com',
    role: 'customer',
  });

  beforeEach(async () => {
    devices = { findByUserAndFingerprint: jest.fn(), touch: jest.fn() };
    refreshTokens = {
      save: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    codeGen = {
      generateVerificationCode: jest.fn(),
      generateSessionToken: jest
        .fn()
        .mockReturnValue({ token: 'opaque', tokenHash: 'opaque-hash' }),
      generateReferralCode: jest.fn(),
      hashToken: jest.fn(),
    };
    jwt = {
      sign: jest.fn().mockReturnValue('access'),
    } as unknown as jest.Mocked<JwtService>;
    config = {
      get: jest.fn().mockReturnValue(30),
    } as unknown as jest.Mocked<ConfigService>;
    refreshTokens.save.mockImplementation((t: RefreshToken) => {
      t.id = 'sid-1';
      return Promise.resolve(t);
    });

    const module = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: DEVICE_REPOSITORY, useValue: devices },
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: refreshTokens },
        { provide: CODE_GENERATOR, useValue: codeGen },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get(SessionService);
  });

  it('emite sesión con deviceId cuando llega fingerprint', async () => {
    const device = new Device();
    device.id = 'dev-1';
    devices.touch.mockResolvedValue(device);

    const result = await service.issue(user, 'fp-1', 'android');

    expect(devices.touch).toHaveBeenCalledWith('u1', 'fp-1', 'android');
    const saved = refreshTokens.save.mock.calls[0][0];
    expect(saved.deviceId).toBe('dev-1');
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1', sid: 'sid-1' }),
    );
    expect(result.refreshToken).toBe('opaque');
  });

  it('emite sesión sin device cuando no llega fingerprint', async () => {
    await service.issue(user);
    expect(devices.touch).not.toHaveBeenCalled();
    const saved = refreshTokens.save.mock.calls[0][0];
    expect(saved.deviceId).toBeNull();
  });
});
