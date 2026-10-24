import { Test } from '@nestjs/testing';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import { LogoutUseCase } from './logout.use-case';

describe('LogoutUseCase', () => {
  it('revoca la sesión indicada', async () => {
    const refreshTokens: jest.Mocked<IRefreshTokenRepository> = {
      save: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        LogoutUseCase,
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: refreshTokens },
      ],
    }).compile();
    const useCase = module.get(LogoutUseCase);

    await useCase.execute({ sessionId: 'sid-1' });
    expect(refreshTokens.revoke).toHaveBeenCalledWith('sid-1');
  });
});
