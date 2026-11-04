import { EntitySchema } from 'typeorm';
import { ModifierOption } from '../../../modules/catalog/domain/entities/modifier-option.entity';

const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const ModifierOptionSchema = new EntitySchema<ModifierOption>({
  name: 'ModifierOption',
  target: ModifierOption,
  tableName: 'modifier_options',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    groupId: { name: 'group_id', type: 'uuid' },
    name: { type: 'varchar', length: 100 },
    extraPrice: {
      name: 'extra_price',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
    },
    isRemovable: { name: 'is_removable', type: 'boolean', default: true },
    isAvailable: { name: 'is_available', type: 'boolean', default: true },
    isReplaceable: { name: 'is_replaceable', type: 'boolean', default: true },
    isReplacementEligible: {
      name: 'is_replacement_eligible',
      type: 'boolean',
      default: true,
    },
    isEssential: { name: 'is_essential', type: 'boolean', default: false },
    sortOrder: { name: 'sort_order', type: 'int', default: 0 },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
// includedByDefault no es columna — la resuelve el repositorio por producto.
