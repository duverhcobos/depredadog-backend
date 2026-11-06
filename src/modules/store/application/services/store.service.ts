import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import storeConfig from '../../../../config/store.config';
import { StoreNotConfiguredException } from '../../domain/exceptions/store-not-configured.exception';
import { StoreSchedule } from '../../domain/services/store-schedule.service';
import { StoreConfigResponseDto } from '../dtos/store-config-response.dto';
import { StoreMapper } from '../mappers/store.mapper';
import { GetStoreConfigUseCase } from '../use-cases/get-store-config.use-case';

@Injectable()
export class StoreService {
  constructor(
    private readonly getStoreConfig: GetStoreConfigUseCase,
    private readonly storeMapper: StoreMapper,
    @Inject(storeConfig.KEY)
    private readonly config: ConfigType<typeof storeConfig>,
  ) {}

  async getConfig(): Promise<StoreConfigResponseDto> {
    const { settings, hours } = await this.getStoreConfig.execute();
    if (!settings) {
      // Sin fila de settings el negocio no está configurado — fallo de
      // despliegue, no del cliente → 404 explícito (la app muestra su
      // estado de error; nunca un "abierto" falso).
      throw new StoreNotConfiguredException();
    }
    const now = new Date();
    const isOpen = StoreSchedule.isOpenNow(hours, now, this.config.timezone);
    const today = StoreSchedule.today(hours, now, this.config.timezone);
    return this.storeMapper.toConfigResponse(settings, hours, isOpen, today);
  }
}
