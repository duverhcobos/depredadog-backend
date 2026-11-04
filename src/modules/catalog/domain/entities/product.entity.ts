import { ModifierGroup } from './modifier-group.entity';
import { ProductImage } from './product-image.entity';

export class Product {
  id!: string;
  categoryId!: string;
  name!: string;
  /** Clave estable para el consumidor: 'depredador', 'cachorro'… */
  slug!: string;
  description: string | null = null;
  basePrice!: number;
  isAvailable = true;
  isCombo = false;
  isFeatured = false;
  sortOrder = 0;
  /** Cargadas por el repositorio solo cuando el use-case las pide. */
  images: ProductImage[] = [];
  modifierGroups: ModifierGroup[] = [];
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt: Date | null = null;
}
