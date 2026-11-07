import { EntityManager, Repository } from 'typeorm';
import { Address } from '../../domain/entities/address.entity';
import { AddressRepository } from './address.repository';

describe('AddressRepository', () => {
  let repo: AddressRepository;
  let orm: jest.Mocked<Repository<Address>>;
  // jest.Mock suelto: las sobrecargas de EntityManager (save/remove/
  // findOne) molestan al tipar mockResolvedValue — lo que importa acá
  // es la interacción, no la firma.
  let em: {
    update: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    findOne: jest.Mock;
  };

  beforeEach(() => {
    em = {
      update: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      findOne: jest.fn(),
    };
    orm = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      save: jest.fn(),
      manager: {
        transaction: jest
          .fn()
          .mockImplementation((cb: (m: EntityManager) => unknown) =>
            cb(em as unknown as EntityManager),
          ),
      },
    } as unknown as jest.Mocked<Repository<Address>>;
    repo = new AddressRepository(orm);
  });

  function address(): Address {
    const a = new Address();
    a.id = 'a1';
    a.userId = 'u1';
    a.isDefault = false;
    return a;
  }

  it('findAllByUserId ordena default primero y luego por antigüedad', async () => {
    orm.find.mockResolvedValue([]);
    await repo.findAllByUserId('u1');
    expect(orm.find).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  });

  it('findByIdForUser filtra por id Y dueño', async () => {
    orm.findOne.mockResolvedValue(null);
    await repo.findByIdForUser('a1', 'u1');
    expect(orm.findOne).toHaveBeenCalledWith({
      where: { id: 'a1', userId: 'u1' },
    });
  });

  it('countByUserId cuenta solo las del usuario', async () => {
    orm.count.mockResolvedValue(3);
    const n = await repo.countByUserId('u1');
    expect(orm.count).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(n).toBe(3);
  });

  it('saveAsExclusiveDefault apaga las demás y luego guarda', async () => {
    const a = address();
    a.isDefault = true;
    em.save.mockImplementation((x: unknown) => Promise.resolve(x));
    const saved = await repo.saveAsExclusiveDefault(a);
    // update ANTES de save — uq_addresses_default no es deferrable:
    // grabar la nueva default primero chocaría con el índice único.
    expect(em.update.mock.invocationCallOrder[0]).toBeLessThan(
      em.save.mock.invocationCallOrder[0],
    );
    // Solo las que tienen el flag prendido, y nunca la propia fila —
    // las hermanas apagadas no reciben bump de updated_at.
    expect(em.update).toHaveBeenCalledWith(
      Address,
      expect.objectContaining({ userId: 'u1', isDefault: true }),
      { isDefault: false },
    );
    const criteria = em.update.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(criteria.id).toBeDefined();
    // La entidad detached escribiría su updatedAt viejo — el repo lo
    // refresca antes del save.
    expect(a.updatedAt).toBeInstanceOf(Date);
    expect(em.save).toHaveBeenCalledWith(a);
    expect(saved).toBe(a);
  });

  it('saveAsExclusiveDefault en una entidad nueva no excluye por id', async () => {
    const a = address();
    a.id = undefined as unknown as string;
    a.isDefault = true;
    em.save.mockImplementation((x: unknown) => Promise.resolve(x));
    await repo.saveAsExclusiveDefault(a);
    const criteria = em.update.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(criteria.userId).toBe('u1');
    expect(criteria.isDefault).toBe(true);
    expect(criteria.id).toBeUndefined();
  });

  it('delete de una no-default no promueve a nadie', async () => {
    const a = address();
    em.remove.mockResolvedValue(a);
    await repo.delete(a);
    expect(em.remove).toHaveBeenCalledWith(a);
    expect(em.findOne).not.toHaveBeenCalled();
  });

  it('delete de la default promueve a la más antigua restante', async () => {
    const a = address();
    a.isDefault = true;
    const oldest = address();
    oldest.id = 'a2';
    em.remove.mockResolvedValue(a);
    em.findOne.mockResolvedValue(oldest);
    em.save.mockResolvedValue(oldest);
    await repo.delete(a);
    expect(em.findOne).toHaveBeenCalledWith(Address, {
      where: { userId: 'u1' },
      order: { createdAt: 'ASC' },
    });
    expect(oldest.isDefault).toBe(true);
    expect(oldest.updatedAt).toBeInstanceOf(Date);
    expect(em.save).toHaveBeenCalledWith(oldest);
  });

  it('delete de la última default no explota si no quedan filas', async () => {
    const a = address();
    a.isDefault = true;
    em.remove.mockResolvedValue(a);
    em.findOne.mockResolvedValue(null);
    await repo.delete(a);
    expect(em.save).not.toHaveBeenCalled();
  });
});
