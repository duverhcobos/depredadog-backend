import { BusinessHour } from '../entities/business-hour.entity';
import { StoreSettings } from '../entities/store-settings.entity';

export interface IStoreRepository {
  /** La única fila de configuración. null = negocio sin configurar. */
  getSettings(): Promise<StoreSettings | null>;
  /** Los 7 días ordenados por day_of_week. */
  getBusinessHours(): Promise<BusinessHour[]>;
}

export const STORE_REPOSITORY = Symbol('IStoreRepository');
