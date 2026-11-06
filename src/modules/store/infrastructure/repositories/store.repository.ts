import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessHour } from '../../domain/entities/business-hour.entity';
import { StoreSettings } from '../../domain/entities/store-settings.entity';
import { IStoreRepository } from '../../domain/repositories/store.repository.interface';

@Injectable()
export class StoreRepository implements IStoreRepository {
  constructor(
    @InjectRepository(StoreSettings)
    private readonly settings: Repository<StoreSettings>,
    @InjectRepository(BusinessHour)
    private readonly hours: Repository<BusinessHour>,
  ) {}

  // Una sola fila por diseño — take(1) defensivo por si algún día hay más.
  async getSettings(): Promise<StoreSettings | null> {
    const rows = await this.settings.find({ take: 1 });
    return rows[0] ?? null;
  }

  getBusinessHours(): Promise<BusinessHour[]> {
    return this.hours.find({ order: { dayOfWeek: 'ASC' } });
  }
}
