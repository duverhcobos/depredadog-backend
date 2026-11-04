import { Category } from '../entities/category.entity';

export interface ICatalogRepository {
  /**
   * Menú completo para la app: categorías activas con sus productos
   * (vivos — incluye isAvailable=false para que la app muestre
   * "agotado"), imagen primaria por producto y el árbol de
   * modificadores por producto (grupos enlazados con opciones, cada
   * opción con su includedByDefault resuelto por producto).
   */
  getMenu(): Promise<Category[]>;
}

export const CATALOG_REPOSITORY = Symbol('ICatalogRepository');
