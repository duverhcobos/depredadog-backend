import { Test } from '@nestjs/testing';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { SessionNotFoundException } from '../../domain/exceptions/session-not-found.exception';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { GetMeUseCase } from './get-me.use-case';

describe('GetMeUseCase', () => {
  let useCase: GetMeUseCase;
  let users: jest.Mocked<IUserRepository>;
  let refreshTokens: jest.Mocked<IRefreshTokenRepository>;

  function activeUser(): User {
    const u = new User();
    u.id = 'u1';
    u.status = UserStatus.ACTIVE;
    return u;
  }

  function liveSession(userId = 'u1'): RefreshToken {
    const t = new RefreshToken();
    t.userId = userId;
    t.expiresAt = new Date(Date.now() + 86_400_000);
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
    refreshTokens = {
      save: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        GetMeUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: refreshTokens },
      ],
    }).compile();
    useCase = module.get(GetMeUseCase);
  });

  it('devuelve el usuario con sesión viva', async () => {
    users.findById.mockResolvedValue(activeUser());
    refreshTokens.findById.mockResolvedValue(liveSession());
    const user = await useCase.execute({ userId: 'u1', sessionId: 's1' });
    expect(user.id).toBe('u1');
  });

  it('401 si la sesión está revocada (logout)', async () => {
    users.findById.mockResolvedValue(activeUser());
    const s = liveSession();
    s.revokedAt = new Date();
    refreshTokens.findById.mockResolvedValue(s);
    await expect(
      useCase.execute({ userId: 'u1', sessionId: 's1' }),
    ).rejects.toBeInstanceOf(SessionNotFoundException);
  });

  it('401 si la sesión pertenece a otro usuario', async () => {
    users.findById.mockResolvedValue(activeUser());
    refreshTokens.findById.mockResolvedValue(liveSession('otro'));
    await expect(
      useCase.execute({ userId: 'u1', sessionId: 's1' }),
    ).rejects.toBeInstanceOf(SessionNotFoundException);
  });

  it('401 si la sesión expiró', async () => {
    users.findById.mockResolvedValue(activeUser());
    const s = liveSession();
    s.expiresAt = new Date(Date.now() - 1);
    refreshTokens.findById.mockResolvedValue(s);
    await expect(
      useCase.execute({ userId: 'u1', sessionId: 's1' }),
    ).rejects.toBeInstanceOf(SessionNotFoundException);
  });

  it('401 si el usuario está suspendido', async () => {
    const u = activeUser();
    u.status = UserStatus.SUSPENDED;
    users.findById.mockResolvedValue(u);
    refreshTokens.findById.mockResolvedValue(liveSession());
    await expect(
      useCase.execute({ userId: 'u1', sessionId: 's1' }),
    ).rejects.toBeInstanceOf(SessionNotFoundException);
  });
});
