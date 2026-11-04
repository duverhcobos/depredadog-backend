import { EntitySchema } from 'typeorm';
import { ProductModifierGroup } from '../../../modules/catalog/domain/entities/product-modifier-group.entity';

export const ProductModifierGroupSchema =
  new EntitySchema<ProductModifierGroup>({
    name: 'ProductModifierGroup',
    target: ProductModifierGroup,
    tableName: 'product_modifier_groups',
    columns: {
      productId: { name: 'product_id', type: 'uuid', primary: true },
      groupId: { name: 'group_id', type: 'uuid', primary: true },
    },
  });
