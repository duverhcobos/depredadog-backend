import { EntitySchema } from 'typeorm';
import { ComboItem } from '../../../modules/catalog/domain/entities/combo-item.entity';

export const ComboItemSchema = new EntitySchema<ComboItem>({
  name: 'ComboItem',
  target: ComboItem,
  tableName: 'combo_items',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    comboId: { name: 'combo_id', type: 'uuid' },
    itemProductId: { name: 'item_product_id', type: 'uuid' },
    quantity: { type: 'int', default: 1 },
  },
});
