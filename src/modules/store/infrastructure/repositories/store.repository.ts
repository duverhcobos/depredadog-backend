import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BusinessHour } from '../../domain/entities/business-hour.entity';
import { StoreSettings } from '../../domain/entities/store-settings.entity';
import { StoreTable } from '../../domain/entities/store-table.entity';
import { IStoreRepository } from '../../domain/repositories/store.repository.interface';

@Injectable()
export class StoreRepository implements IStoreRepository {
  constructor(
    @InjectRepository(StoreSettings)
    private readonly settings: Repository<StoreSettings>,
    @InjectRepository(BusinessHour)
    private readonly hours: Repository<BusinessHour>,
    @InjectRepository(StoreTable)
    private readonly tables: Repository<StoreTable>,
  ) { }

  // Una sola fila por diseño — take(1) defensivo por si algún día hay más.
  async getSettings(): Promise<StoreSettings | null> {
    const rows = await this.settings.find({ take: 1 });
    return rows[0] ?? null;
  }

  getBusinessHours(): Promise<BusinessHour[]> {
    return this.hours.find({ order: { dayOfWeek: 'ASC' } });
  }

  getTables(): Promise<StoreTable[]> {
    return this.tables.find({ order: { label: 'ASC' } });
  }

  getTablesByIds(ids: string[]): Promise<StoreTable[]> {
    // [] → [] — evita el IN () vacío (y es honesto: nada que buscar).
    if (ids.length === 0) return Promise.resolve([]);
    return this.tables.find({ where: { id: In(ids) } });
  }
}
