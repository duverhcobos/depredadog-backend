import { Test } from '@nestjs/testing';
import { BusinessHour } from '../../domain/entities/business-hour.entity';
import { StoreSettings } from '../../domain/entities/store-settings.entity';
import {
  IStoreRepository,
  STORE_REPOSITORY,
} from '../../domain/repositories/store.repository.interface';
import { GetStoreConfigUseCase } from './get-store-config.use-case';

describe('GetStoreConfigUseCase', () => {
  let useCase: GetStoreConfigUseCase;
  let store: jest.Mocked<IStoreRepository>;

  beforeEach(async () => {
    store = {
      getSettings: jest.fn(),
      getBusinessHours: jest.fn(),
      getTables: jest.fn(),
      getTablesByIds: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        GetStoreConfigUseCase,
        { provide: STORE_REPOSITORY, useValue: store },
      ],
    }).compile();
    useCase = module.get(GetStoreConfigUseCase);
  });

  it('devuelve {settings, hours} del repositorio en una sola llamada', async () => {
    const settings = new StoreSettings();
    const hours = [new BusinessHour()];
    store.getSettings.mockResolvedValue(settings);
    store.getBusinessHours.mockResolvedValue(hours);

    const result = await useCase.execute();

    expect(result).toEqual({ settings, hours });
    expect(store.getSettings).toHaveBeenCalledTimes(1);
    expect(store.getBusinessHours).toHaveBeenCalledTimes(1);
  });

  it('settings null pasa tal cual — el service decide el 404', async () => {
    store.getSettings.mockResolvedValue(null);
    store.getBusinessHours.mockResolvedValue([]);

    await expect(useCase.execute()).resolves.toEqual({
      settings: null,
      hours: [],
    });
  });
});
