import { BusinessHour } from '../entities/business-hour.entity';
import { StoreSettings } from '../entities/store-settings.entity';
import { StoreTable } from '../entities/store-table.entity';

export interface IStoreRepository {
  /** La única fila de configuración. null = negocio sin configurar. */
  getSettings(): Promise<StoreSettings | null>;
  /** Los 7 días ordenados por day_of_week. */
  getBusinessHours(): Promise<BusinessHour[]>;
  /** Mesas del local ordenadas por label — panel admin. */
  getTables(): Promise<StoreTable[]>;
  /** Mesas por ids — enriquecimiento batcheado de la cola admin. */
  getTablesByIds(ids: string[]): Promise<StoreTable[]>;
}

export const STORE_REPOSITORY = Symbol('IStoreRepository');
