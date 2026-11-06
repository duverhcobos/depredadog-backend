import { Inject, Injectable } from '@nestjs/common';
import { BusinessHour } from '../../domain/entities/business-hour.entity';
import { StoreSettings } from '../../domain/entities/store-settings.entity';
import {
  type IStoreRepository,
  STORE_REPOSITORY,
} from '../../domain/repositories/store.repository.interface';

export interface StoreConfigResult {
  settings: StoreSettings | null;
  hours: BusinessHour[];
}

@Injectable()
export class GetStoreConfigUseCase {
  constructor(
    @Inject(STORE_REPOSITORY)
    private readonly store: IStoreRepository,
  ) {}

  execute(): Promise<StoreConfigResult> {
    return Promise.all([
      this.store.getSettings(),
      this.store.getBusinessHours(),
    ]).then(([settings, hours]) => ({ settings, hours }));
  }
}
