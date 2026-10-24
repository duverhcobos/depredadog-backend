import { IsNull, Repository } from 'typeorm';
import { AuthToken } from '../../domain/entities/auth-token.entity';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import { AuthTokenRepository } from './auth-token.repository';

describe('AuthTokenRepository', () => {
  let repo: AuthTokenRepository;
  let orm: jest.Mocked<Repository<AuthToken>>;

  beforeEach(() => {
    orm = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<AuthToken>>;
    repo = new AuthTokenRepository(orm);
  });

  it('findValidByHash filtra por tipo y no consumido', async () => {
    orm.findOne.mockResolvedValue(null);
    await repo.findValidByHash('h', AuthTokenType.EMAIL_VERIFICATION);
    expect(orm.findOne).toHaveBeenCalledWith({
      where: {
        tokenHash: 'h',
        type: AuthTokenType.EMAIL_VERIFICATION,
        consumedAt: IsNull(),
      },
    });
  });

  it('consume marca consumed_at solo si estaba pendiente', async () => {
    orm.update.mockResolvedValue({ affected: 1 } as never);
    const result = await repo.consume('tok-1');
    expect(result).toBe(true);
    expect(orm.update).toHaveBeenCalledWith(
      { id: 'tok-1', consumedAt: IsNull() },
      { consumedAt: expect.any(Date) },
    );
  });

  it('consume devuelve false si el token ya estaba consumido', async () => {
    orm.update.mockResolvedValue({ affected: 0 } as never);
    const result = await repo.consume('tok-1');
    expect(result).toBe(false);
  });

  it('consumePendingForUser invalida códigos previos del mismo tipo', async () => {
    await repo.consumePendingForUser('u1', AuthTokenType.PASSWORD_RESET);
    expect(orm.update).toHaveBeenCalledWith(
      {
        userId: 'u1',
        type: AuthTokenType.PASSWORD_RESET,
        consumedAt: IsNull(),
      },
      { consumedAt: expect.any(Date) },
    );
  });
});
