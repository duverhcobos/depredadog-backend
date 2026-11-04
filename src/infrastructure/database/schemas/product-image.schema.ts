import { EntitySchema } from 'typeorm';
import { ProductImage } from '../../../modules/catalog/domain/entities/product-image.entity';

export const ProductImageSchema = new EntitySchema<ProductImage>({
  name: 'ProductImage',
  target: ProductImage,
  tableName: 'product_images',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    productId: { name: 'product_id', type: 'uuid' },
    imageUrl: { name: 'image_url', type: 'varchar', length: 500 },
    sortOrder: { name: 'sort_order', type: 'int', default: 0 },
    isPrimary: { name: 'is_primary', type: 'boolean', default: false },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
  },
});
