export class ProductImage {
  id!: string;
  productId!: string;
  imageUrl!: string;
  sortOrder = 0;
  isPrimary = false;
  createdAt!: Date;
}
