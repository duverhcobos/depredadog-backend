import { Promotion } from '../entities/promotion.entity';

export interface IPromotionRepository {
  /**
   * Ofertas activas ordenadas por sort_order — alimentan el motor de
   * promociones al crear pedidos (ambos canales) y el rail de Combos
   * del GET /catalog. Las inactivas NO se evalúan ni se muestran.
   */
  findActive(): Promise<Promotion[]>;
}

export const PROMOTION_REPOSITORY = Symbol('IPromotionRepository');
