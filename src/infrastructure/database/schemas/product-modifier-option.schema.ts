import { EntitySchema } from 'typeorm';
import { ProductModifierOption } from '../../../modules/catalog/domain/entities/product-modifier-option.entity';

export const ProductModifierOptionSchema =
  new EntitySchema<ProductModifierOption>({
    name: 'ProductModifierOption',
    target: ProductModifierOption,
    tableName: 'product_modifier_options',
    columns: {
      productId: { name: 'product_id', type: 'uuid', primary: true },
      optionId: { name: 'option_id', type: 'uuid', primary: true },
      includedByDefault: {
        name: 'included_by_default',
        type: 'boolean',
        default: true,
      },
      sortOrder: { name: 'sort_order', type: 'int', default: 0 },
    },
  });
