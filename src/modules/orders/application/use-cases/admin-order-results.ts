import { StoreTable } from '../../../store/domain/entities/store-table.entity';
import { Order } from '../../domain/entities/order.entity';

// Estructuras internas use-case → service (strict-layering-rule): los
// use-cases admin resuelven entidad + contexto operativo batcheado;
// la conversión a DTO de respuesta le corresponde al mapper invocado
// desde el service — el use-case nunca construye DTOs.
export interface AdminOrderResult {
  order: Order;
  tableLabel: string | null;
  customerName: string | null;
}

export interface AdminOrderListResult {
  items: AdminOrderResult[];
  total: number;
}

export interface AdminTablesResult {
  tables: StoreTable[];
  activeByTable: Map<string, number>;
}
