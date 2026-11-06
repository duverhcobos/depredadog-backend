import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { BusinessHour } from '../../domain/entities/business-hour.entity';
import { StoreSettings } from '../../domain/entities/store-settings.entity';
import { StoreRepository } from './store.repository';

describe('StoreRepository', () => {
  let repo: StoreRepository;
  let settings: jest.Mocked<Repository<StoreSettings>>;
  let hours: jest.Mocked<Repository<BusinessHour>>;

  function orm<T extends ObjectLiteral>(): jest.Mocked<Repository<T>> {
    return { find: jest.fn() } as unknown as jest.Mocked<Repository<T>>;
  }

  beforeEach(async () => {
    settings = orm();
    hours = orm();
    const module = await Test.createTestingModule({
      providers: [
        StoreRepository,
        { provide: getRepositoryToken(StoreSettings), useValue: settings },
        { provide: getRepositoryToken(BusinessHour), useValue: hours },
      ],
    }).compile();
    repo = module.get(StoreRepository);
  });

  describe('getSettings', () => {
    it('devuelve la primera fila de la tabla (take 1)', async () => {
      const row = new StoreSettings();
      settings.find.mockResolvedValue([row]);

      const result = await repo.getSettings();

      expect(result).toBe(row);
      expect(settings.find).toHaveBeenCalledWith({ take: 1 });
    });

    it('tabla vacía → null (negocio sin configurar)', async () => {
      settings.find.mockResolvedValue([]);

      await expect(repo.getSettings()).resolves.toBeNull();
      expect(settings.find).toHaveBeenCalledWith({ take: 1 });
    });
  });

  describe('getBusinessHours', () => {
    it('consulta los 7 días ordenados por dayOfWeek ASC', async () => {
      const rows = [new BusinessHour(), new BusinessHour()];
      hours.find.mockResolvedValue(rows);

      const result = await repo.getBusinessHours();

      expect(result).toBe(rows);
      expect(hours.find).toHaveBeenCalledWith({
        order: { dayOfWeek: 'ASC' },
      });
    });
  });
});
