import { IsNull, Repository } from 'typeorm';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { RefreshTokenRepository } from './refresh-token.repository';

describe('RefreshTokenRepository', () => {
  let repo: RefreshTokenRepository;
  let orm: jest.Mocked<Repository<RefreshToken>>;

  beforeEach(() => {
    orm = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<RefreshToken>>;
    repo = new RefreshTokenRepository(orm);
  });

  it('revoke marca revoked_at solo si estaba activa', async () => {
    orm.update.mockResolvedValue({ affected: 1 } as never);
    const result = await repo.revoke('rt-1');
    expect(result).toBe(true);
    expect(orm.update).toHaveBeenCalledWith(
      { id: 'rt-1', revokedAt: IsNull() },
      { revokedAt: expect.any(Date) },
    );
  });

  it('revoke devuelve false si la sesión ya estaba revocada', async () => {
    orm.update.mockResolvedValue({ affected: 0 } as never);
    const result = await repo.revoke('rt-1');
    expect(result).toBe(false);
  });

  it('revokeAllForUser revoca todas las sesiones vivas', async () => {
    await repo.revokeAllForUser('u1');
    expect(orm.update).toHaveBeenCalledWith(
      { userId: 'u1', revokedAt: IsNull() },
      { revokedAt: expect.any(Date) },
    );
  });
});
