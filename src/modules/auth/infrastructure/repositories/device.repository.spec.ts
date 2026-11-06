import { QueryFailedError, Repository } from 'typeorm';
import { Device } from '../../domain/entities/device.entity';
import { DeviceRepository } from './device.repository';

describe('DeviceRepository', () => {
  let repo: DeviceRepository;
  let orm: jest.Mocked<Repository<Device>>;

  beforeEach(() => {
    orm = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Device>>;
    repo = new DeviceRepository(orm);
  });

  it('touch crea el device si no existe', async () => {
    orm.findOne.mockResolvedValue(null);
    orm.save.mockImplementation((d: Device) => Promise.resolve(d));
    const device = await repo.touch('u1', 'fp-1', 'android');
    expect(orm.save).toHaveBeenCalled();
    expect(device.userId).toBe('u1');
    expect(device.fingerprint).toBe('fp-1');
  });

  it('touch actualiza last_seen si ya existe', async () => {
    const existing = new Device();
    existing.platform = 'android';
    orm.findOne.mockResolvedValue(existing);
    orm.save.mockImplementation((d: Device) => Promise.resolve(d));
    const device = await repo.touch('u1', 'fp-1', 'ios');
    expect(device.platform).toBe('ios');
    expect(orm.save).toHaveBeenCalledWith(existing);
  });

  it('touch resuelve carrera del UNIQUE devolviendo al ganador', async () => {
    const winner = new Device();
    orm.findOne
      .mockResolvedValueOnce(null) // no existía
      .mockResolvedValueOnce(winner); // el otro proceso ganó
    orm.save.mockRejectedValue(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('driver'), { code: '23505' }),
      ),
    );
    const device = await repo.touch('u1', 'fp-1', null);
    expect(device).toBe(winner);
  });
});
