import { Inject, Injectable } from '@nestjs/common';
import {
  type ICatalogRepository,
  CATALOG_REPOSITORY,
} from '../../../catalog/domain/repositories/catalog.repository.interface';
import { PromotionKind } from '../../../promotions/domain/enums/promotion-kind.enum';
import { Promotion } from '../../../promotions/domain/entities/promotion.entity';
import {
  type IPromotionRepository,
  PROMOTION_REPOSITORY,
} from '../../../promotions/domain/repositories/promotion.repository.interface';
import {
  AppliedPromotion,
  PromotionEvaluator,
} from '../../../promotions/domain/services/promotion-evaluator.service';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { OrderCatalogViolationException } from '../../domain/exceptions/order-catalog-violation.exception';
import { OrderItemsBuilder } from '../../domain/services/order-items-builder.service';

export interface OrderPromotionsResult {
  /** Ítems del pedido — incluye los auto-inyectados (papas de la casa). */
  items: OrderItem[];
  /** Descuento total a restar de subtotal + deliveryFee. */
  discount: number;
  /** Snapshot para orders.applied_promotions ([] = nada aplicó). */
  appliedPromotions: AppliedPromotion[];
}

// Puente entre el motor puro (PromotionEvaluator) y los puertos:
// trae las promos activas, resuelve los precios que el pedido no trae
// (el freeProduct auto-inyectado) y construye los ítems extra con el
// mismo builder que revalida el payload — snapshots reales, mismo 409.
@Injectable()
export class OrderPromotionsApplier {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalog: ICatalogRepository,
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotions: IPromotionRepository,
    private readonly evaluator: PromotionEvaluator,
    private readonly itemsBuilder: OrderItemsBuilder,
  ) {}

  async apply(items: OrderItem[]): Promise<OrderPromotionsResult> {
    const promos = await this.promotions.findActive();
    if (promos.length === 0) {
      return { items, discount: 0, appliedPromotions: [] };
    }
    const basePrices = await this.referencedPrices(promos, items);
    const evaluation = this.evaluator.evaluate(items, promos, basePrices);

    let discount = evaluation.discount;
    const applied = [...evaluation.appliedPromotions];
    let finalItems = items;
    for (const extra of evaluation.extraItems) {
      try {
        const built = await this.itemsBuilder.build([
          {
            productId: extra.productId,
            quantity: extra.quantity,
            modifiers: [],
          },
        ]);
        finalItems = [...finalItems, ...built];
      } catch (e) {
        // El regalo se agotó entre la evaluación y la construcción (o
        // quedó mal configurado): la promo se retira COMPLETA — mejor
        // pedido sin promo que 409 por una cortesía de la casa.
        if (!(e instanceof OrderCatalogViolationException)) throw e;
        const entry = applied.find((a) => a.slug === extra.promotionSlug);
        discount -= entry?.saving ?? 0;
        const idx = applied.findIndex((a) => a.slug === extra.promotionSlug);
        if (idx >= 0) applied.splice(idx, 1);
      }
    }
    return { items: finalItems, discount, appliedPromotions: applied };
  }

  // Precios base de los productos que las promos referencian y el
  // pedido NO trae — hoy solo hace falta para el freeProductId
  // auto-inyectado (lo que ya está en ítems lo deriva el evaluador).
  // getOrderableProducts filtra agotados/categorías inactivas: si el
  // regalo no se puede vender tampoco se regala — el evaluador ve el
  // id sin precio y la promo no dispara.
  private async referencedPrices(
    promos: Promotion[],
    items: OrderItem[],
  ): Promise<Map<string, number>> {
    const inOrder = new Set(items.map((i) => i.productId));
    // products.id es uuid — un freeProductId mal configurado (literal
    // suelto, slug) no debe tumbar el pedido con un error de cast: se
    // ignora y el evaluador lo trata como "regalo no vendible".
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const needed = [
      ...new Set(
        promos
          .filter((p) => p.kind === PromotionKind.FREE_ITEM)
          .map((p) => (p.config as { freeProductId: string }).freeProductId)
          .filter((id) => id && uuid.test(id) && !inOrder.has(id)),
      ),
    ];
    if (needed.length === 0) return new Map();
    const products = await this.catalog.getOrderableProducts(needed);
    return new Map(products.map((p) => [p.id, p.basePrice]));
  }
}
