import { Test } from '@nestjs/testing';
import storeConfig from '../../../../config/store.config';
import { BusinessHour } from '../../domain/entities/business-hour.entity';
import { StoreSettings } from '../../domain/entities/store-settings.entity';
import { StoreNotConfiguredException } from '../../domain/exceptions/store-not-configured.exception';
import { StoreConfigResponseDto } from '../dtos/store-config-response.dto';
import { StoreMapper } from '../mappers/store.mapper';
import { GetStoreConfigUseCase } from '../use-cases/get-store-config.use-case';
import { StoreService } from './store.service';

describe('StoreService', () => {
  const TZ = 'America/Bogota';

  let service: StoreService;
  let getStoreConfig: { execute: jest.Mock };
  let storeMapper: { toConfigResponse: jest.Mock };

  beforeEach(async () => {
    getStoreConfig = { execute: jest.fn() };
    storeMapper = { toConfigResponse: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        StoreService,
        { provide: GetStoreConfigUseCase, useValue: getStoreConfig },
        { provide: StoreMapper, useValue: storeMapper },
        { provide: storeConfig.KEY, useValue: { timezone: TZ } },
      ],
    }).compile();
    service = module.get(StoreService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function hour(dayOfWeek: number): BusinessHour {
    const h = new BusinessHour();
    h.dayOfWeek = dayOfWeek;
    h.opensAt = '17:00:00';
    h.closesAt = '23:00:00';
    h.isClosed = false;
    return h;
  }

  it('settings null → StoreNotConfiguredException (404)', async () => {
    getStoreConfig.execute.mockResolvedValue({ settings: null, hours: [] });

    await expect(service.getConfig()).rejects.toBeInstanceOf(
      StoreNotConfiguredException,
    );
    await expect(service.getConfig()).rejects.toMatchObject({
      httpStatus: 404,
    });
  });

  it('deriva isOpen/today con la hora del negocio y delega el armado al mapper', async () => {
    // Martes 18:00 en Bogotá — dentro del rango 17–23.
    jest.useFakeTimers().setSystemTime(new Date('2026-11-03T18:00:00-05:00'));
    const settings = new StoreSettings();
    const hours = [hour(2)];
    const dto = new StoreConfigResponseDto();
    getStoreConfig.execute.mockResolvedValue({ settings, hours });
    storeMapper.toConfigResponse.mockReturnValue(dto);

    const result = await service.getConfig();

    expect(storeMapper.toConfigResponse).toHaveBeenCalledWith(
      settings,
      hours,
      true,
      hours[0],
    );
    expect(result).toBe(dto);
  });

  it('fuera de horario → isOpen=false al mapper', async () => {
    // Martes 10:00 en Bogotá — antes de abrir.
    jest.useFakeTimers().setSystemTime(new Date('2026-11-03T10:00:00-05:00'));
    const settings = new StoreSettings();
    const hours = [hour(2)];
    getStoreConfig.execute.mockResolvedValue({ settings, hours });
    storeMapper.toConfigResponse.mockReturnValue(new StoreConfigResponseDto());

    await service.getConfig();

    expect(storeMapper.toConfigResponse).toHaveBeenCalledWith(
      settings,
      hours,
      false,
      hours[0],
    );
  });
});
