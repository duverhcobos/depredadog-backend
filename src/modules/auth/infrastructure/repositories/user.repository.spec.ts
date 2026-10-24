import { QueryFailedError, Repository } from 'typeorm';
import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyRegisteredException } from '../../domain/exceptions/email-already-registered.exception';
import { UserRepository } from './user.repository';

describe('UserRepository', () => {
  let repo: UserRepository;
  let orm: jest.Mocked<Repository<User>>;

  beforeEach(() => {
    orm = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;
    repo = new UserRepository(orm);
  });

  it('findByEmail normaliza a minúsculas y excluye soft-deleted', async () => {
    orm.findOne.mockResolvedValue(null);
    await repo.findByEmail('A@B.COM');
    expect(orm.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: 'a@b.com' }),
      }),
    );
  });

  it('save traduce unique violation de email a 409', async () => {
    const driverError = { code: '23505', constraint: 'uq_users_email' };
    orm.save.mockRejectedValue(new QueryFailedError('INSERT', [], driverError));
    await expect(repo.save(new User())).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredException,
    );
  });

  it('save re-lanza errores que no son unique de email', async () => {
    const error = new Error('connection lost');
    orm.save.mockRejectedValue(error);
    await expect(repo.save(new User())).rejects.toBe(error);
  });
});
