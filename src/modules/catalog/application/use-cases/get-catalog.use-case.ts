import { Inject, Injectable } from '@nestjs/common';
import {
  FreeItemConfig,
  Promotion,
} from '../../../promotions/domain/entities/promotion.entity';
import { PromotionKind } from '../../../promotions/domain/enums/promotion-kind.enum';
import {
  type IPromotionRepository,
  PROMOTION_REPOSITORY,
} from '../../../promotions/domain/repositories/promotion.repository.interface';
import { Category } from '../../domain/entities/category.entity';
import {
  type ICatalogRepository,
  CATALOG_REPOSITORY,
} from '../../domain/repositories/catalog.repository.interface';

export interface CatalogResult {
  categories: Category[];
  /** Ofertas activas por sort_order — el rail de Combos (§027). */
  promotions: Promotion[];
  /** basePrice por productId elegible de las promos `free_item` — el
   *  mapper arma "desde $X" con el elegible más barato ORDENABLE
   *  (getOrderableProducts excluye agotados/categoría inactiva, igual
   *  que al validar un pedido). */
  productBasePrices: Map<string, number>;
}

@Injectable()
export class GetCatalogUseCase {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalog: ICatalogRepository,
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotions: IPromotionRepository,
  ) {}

  // Menú completo para la app + el rail de Combos. Vacío NO es error:
  // la carta puede estar sin cargar todavía y la app muestra su
  // empty-state.
  async execute(): Promise<CatalogResult> {
    const [categories, promotions] = await Promise.all([
      this.catalog.getMenu(),
      this.promotions.findActive(),
    ]);
    const eligibleIds = [
      ...new Set(
        promotions
          .filter((p) => p.kind === PromotionKind.FREE_ITEM)
          .flatMap(
            (p) => (p.config as FreeItemConfig).eligibleProductIds ?? [],
          ),
      ),
    ];
    const priced = eligibleIds.length
      ? await this.catalog.getOrderableProducts(eligibleIds)
      : [];
    return {
      categories,
      promotions,
      productBasePrices: new Map(priced.map((p) => [p.id, p.basePrice])),
    };
  }
}
