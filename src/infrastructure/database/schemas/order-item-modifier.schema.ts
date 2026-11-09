import { EntitySchema } from 'typeorm';
import { OrderItemModifier } from '../../../modules/orders/domain/entities/order-item-modifier.entity';
import { ModifierAction } from '../../../modules/orders/domain/enums/modifier-action.enum';

const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const OrderItemModifierSchema = new EntitySchema<OrderItemModifier>({
  name: 'OrderItemModifier',
  target: OrderItemModifier,
  tableName: 'order_item_modifiers',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    orderItemId: { name: 'order_item_id', type: 'uuid' },
    optionId: { name: 'option_id', type: 'uuid', nullable: true },
    optionName: { name: 'option_name', type: 'varchar', length: 100 },
    action: {
      type: 'enum',
      enum: ModifierAction,
      enumName: 'modifier_action',
    },
    priceDelta: {
      name: 'price_delta',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
      default: 0,
    },
    modifierGroup: {
      name: 'modifier_group',
      type: 'varchar',
      length: 50,
      nullable: true,
    },
    replacesOptionId: {
      name: 'replaces_option_id',
      type: 'uuid',
      nullable: true,
    },
  },
});
