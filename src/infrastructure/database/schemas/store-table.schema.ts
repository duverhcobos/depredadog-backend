import { EntitySchema } from 'typeorm';
import { StoreTable } from '../../../modules/store/domain/entities/store-table.entity';

export const StoreTableSchema = new EntitySchema<StoreTable>({
  name: 'StoreTable',
  target: StoreTable,
  tableName: 'tables',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    label: { type: 'varchar', length: 20 },
    isActive: { name: 'is_active', type: 'boolean', default: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
  },
});
