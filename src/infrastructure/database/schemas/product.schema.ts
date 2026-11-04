import { EntitySchema } from 'typeorm';
import { Product } from '../../../modules/catalog/domain/entities/product.entity';

// numeric(10,2) llega de pg como string — transformer a number en la frontera.
const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const ProductSchema = new EntitySchema<Product>({
  name: 'Product',
  target: Product,
  tableName: 'products',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    categoryId: { name: 'category_id', type: 'uuid' },
    name: { type: 'varchar', length: 150 },
    description: { type: 'text', nullable: true },
    basePrice: {
      name: 'base_price',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
    },
    isAvailable: { name: 'is_available', type: 'boolean', default: true },
    isCombo: { name: 'is_combo', type: 'boolean', default: false },
    isFeatured: { name: 'is_featured', type: 'boolean', default: false },
    sortOrder: { name: 'sort_order', type: 'int', default: 0 },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
    deletedAt: {
      name: 'deleted_at',
      type: 'timestamptz',
      nullable: true,
      deleteDate: true,
    },
  },
});
