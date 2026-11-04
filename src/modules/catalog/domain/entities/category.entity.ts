import { Product } from './product.entity';

export class Category {
  id!: string;
  name!: string;
  slug!: string;
  description: string | null = null;
  imageUrl: string | null = null;
  isActive = true;
  sortOrder = 0;
  /** Cargada por el repositorio solo cuando el use-case la pide. */
  products: Product[] = [];
  createdAt!: Date;
  updatedAt!: Date;
}
