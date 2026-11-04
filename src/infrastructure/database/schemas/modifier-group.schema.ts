import { EntitySchema } from 'typeorm';
import { ModifierGroup } from '../../../modules/catalog/domain/entities/modifier-group.entity';

export const ModifierGroupSchema = new EntitySchema<ModifierGroup>({
  name: 'ModifierGroup',
  target: ModifierGroup,
  tableName: 'modifier_groups',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    slug: { type: 'varchar', length: 50 },
    name: { type: 'varchar', length: 100 },
    minSelect: { name: 'min_select', type: 'int', default: 0 },
    maxSelect: { name: 'max_select', type: 'int', nullable: true },
    sortOrder: { name: 'sort_order', type: 'int', default: 0 },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
