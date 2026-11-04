import { EntitySchema } from 'typeorm';
import { Category } from '../../../modules/catalog/domain/entities/category.entity';

export const CategorySchema = new EntitySchema<Category>({
  name: 'Category',
  target: Category,
  tableName: 'categories',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    name: { type: 'varchar', length: 100 },
    slug: { type: 'varchar', length: 100 },
    description: { type: 'text', nullable: true },
    imageUrl: {
      name: 'image_url',
      type: 'varchar',
      length: 500,
      nullable: true,
    },
    isActive: { name: 'is_active', type: 'boolean', default: true },
    sortOrder: { name: 'sort_order', type: 'int', default: 0 },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
