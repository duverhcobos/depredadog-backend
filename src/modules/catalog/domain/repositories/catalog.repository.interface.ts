import { Category } from '../entities/category.entity';
import { Product } from '../entities/product.entity';

export interface ICatalogRepository {
  /**
   * Menú completo para la app: categorías activas con sus productos
   * (vivos — incluye isAvailable=false para que la app muestre
   * "agotado"), imagen primaria por producto y el árbol de
   * modificadores por producto (grupos enlazados con opciones, cada
   * opción con su includedByDefault resuelto por producto).
   */
  getMenu(): Promise<Category[]>;
  /**
   * Productos por ids con su árbol de modificadores resuelto para
   * REVALIDAR un pedido: options con extraPrice/isAvailable/
   * isRemovable/isReplaceable/isReplacementEligible/isEssential e
   * includedByDefault por producto. Incluye isAvailable=false para
   * que el use-case distinga "agotado" de "no existe".
   */
  getOrderableProducts(productIds: string[]): Promise<Product[]>;
}

export const CATALOG_REPOSITORY = Symbol('ICatalogRepository');
