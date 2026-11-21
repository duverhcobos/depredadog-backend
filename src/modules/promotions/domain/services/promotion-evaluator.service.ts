import { Injectable } from '@nestjs/common';
import {
  FixedBundleConfig,
  FreeItemConfig,
  PercentOffConfig,
  Promotion,
} from '../entities/promotion.entity';
import { PromotionKind } from '../enums/promotion-kind.enum';

// ── Contrato de entrada/salida ─────────────────────────────────────
// El evaluador es PURO (sin I/O): recibe los ítems ya construidos por
// OrderItemsBuilder (catálogo revalidado, lineTotals calculados) y las
// promociones activas, y devuelve el descuento + el snapshot de lo
// aplicado + los ítems a inyectar. La interfaz mínima es estructural —
// OrderItem la satisface sin importar orders/domain.

export interface EvaluableOrderItem {
  productId: string;
  quantity: number;
  /** unitPrice con modificadores (base + Σ priceDelta de added). */
  unitPrice: number;
  lineTotal: number;
  modifiers: ReadonlyArray<{ action: string; priceDelta: number }>;
}

/** Snapshot persistido en orders.applied_promotions — sobrevive a
 *  desactivar/editar la promo después. */
export interface AppliedPromotion {
  slug: string;
  name: string;
  saving: number;
}

/** Ítem a inyectar por la casa (papas gratis auto-agregada).
 *  `promotionSlug` permite al orquestador deshacer la promo si el
 *  producto ya no se puede construir. */
export interface PromotionExtraItem {
  productId: string;
  quantity: number;
  promotionSlug: string;
}

export interface PromotionEvaluation {
  /** Suma a orders.discount — se resta de subtotal + deliveryFee. */
  discount: number;
  appliedPromotions: AppliedPromotion[];
  /** Ítems a construir con snapshots reales y apendar (discount los neta). */
  extraItems: PromotionExtraItem[];
}

// Una unidad de producto expandida del quantity de su línea — cada
// unidad se consume UNA vez: las promos no compiten por el mismo perro.
interface Unit {
  productId: string;
  /** Precio de línea por unidad (base + modificadores). */
  unitPrice: number;
  /** Base del producto sin extras — lo que cubren bundles/freebies. */
  unitBase: number;
}

// Precedencia del greedy (§027): percent_off (tier mayor) → free_item
// → fixed_bundle. showcase jamás se evalúa. Dentro de un mismo kind se
// respeta el orden recibido (sort_order del repositorio).
const KIND_PRECEDENCE: Record<PromotionKind, number> = {
  [PromotionKind.PERCENT_OFF]: 0,
  [PromotionKind.FREE_ITEM]: 1,
  [PromotionKind.FIXED_BUNDLE]: 2,
  [PromotionKind.SHOWCASE]: 3,
};

@Injectable()
export class PromotionEvaluator {
  evaluate(
    items: EvaluableOrderItem[],
    promotions: Promotion[],
    // basePrice por productId para lo que el pedido NO trae (hoy solo
    // hace falta para freeProductId auto-inyectado — lo que ya está en
    // ítems se deriva de la línea, más fiel que el catálogo).
    productBasePrices: ReadonlyMap<string, number>,
  ): PromotionEvaluation {
    const units: Unit[] = items.flatMap((i) =>
      Array.from({ length: i.quantity }, () => ({
        productId: i.productId,
        unitPrice: i.unitPrice,
        unitBase: this.unitBase(i),
      })),
    );
    const consumed = new Array<boolean>(units.length).fill(false);
    const availableIdx = (productIds: readonly string[]): number[] =>
      units
        .map((u, i) => i)
        .filter((i) => !consumed[i] && productIds.includes(units[i].productId));

    const result: PromotionEvaluation = {
      discount: 0,
      appliedPromotions: [],
      extraItems: [],
    };

    const ordered = [...promotions].sort(
      (a, b) => KIND_PRECEDENCE[a.kind] - KIND_PRECEDENCE[b.kind],
    );

    for (const promo of ordered) {
      switch (promo.kind) {
        case PromotionKind.PERCENT_OFF:
          this.applyPercentOff(promo, units, availableIdx, consumed, result);
          break;
        case PromotionKind.FREE_ITEM:
          this.applyFreeItem(
            promo,
            items,
            units,
            availableIdx,
            consumed,
            productBasePrices,
            result,
          );
          break;
        case PromotionKind.FIXED_BUNDLE:
          this.applyFixedBundle(promo, units, availableIdx, consumed, result);
          break;
        case PromotionKind.SHOWCASE:
          break; // card presentacional — el motor no la evalúa.
      }
    }
    return result;
  }

  // percent_off: ≥minQty unidades elegibles → percent% de SUS lineTotals
  // (base + modificadores — "el perro completo"), redondeo hacia abajo
  // a roundDownTo. Consume TODAS las unidades elegibles: el tier es
  // excluyente, ya no quedan perros para free_item/bundle.
  private applyPercentOff(
    promo: Promotion,
    units: Unit[],
    availableIdx: (ids: readonly string[]) => number[],
    consumed: boolean[],
    result: PromotionEvaluation,
  ): void {
    const cfg = promo.config as PercentOffConfig;
    if (!cfg.eligibleProductIds?.length || !cfg.minQty || !cfg.percent) return;
    const round = cfg.roundDownTo ?? 1;
    const idx = availableIdx(cfg.eligibleProductIds);
    if (idx.length < cfg.minQty) return;
    const base = idx.reduce((s, i) => s + units[i].unitPrice, 0);
    const saving = Math.floor((base * cfg.percent) / 100 / round) * round;
    if (saving <= 0) return;
    for (const i of idx) consumed[i] = true;
    this.record(result, promo, saving);
  }

  // free_item: elegibles en [minQty, maxQty] → freeQty del producto a
  // $0. Si el pedido ya lo trae, el ahorro cubre su línea; si no, se
  // marca para inyección (el builder lo construye con snapshots reales
  // y el descuento lo deja neto en $0).
  private applyFreeItem(
    promo: Promotion,
    items: EvaluableOrderItem[],
    units: Unit[],
    availableIdx: (ids: readonly string[]) => number[],
    consumed: boolean[],
    productBasePrices: ReadonlyMap<string, number>,
    result: PromotionEvaluation,
  ): void {
    const cfg = promo.config as FreeItemConfig;
    if (!cfg.eligibleProductIds?.length || !cfg.minQty || !cfg.freeProductId) {
      return;
    }
    const idx = availableIdx(cfg.eligibleProductIds);
    const cap = cfg.maxQty ?? Number.MAX_SAFE_INTEGER;
    if (idx.length < cfg.minQty || idx.length > cap) return;
    // El ahorro es el BASE del producto regalado (sus extras cobran
    // aparte). Deriva de la línea si el pedido ya lo trae; si no, del
    // mapa de precios — sin precio resoluble el regalo no se puede
    // honrar y la promo no dispara (degrada, no rompe el pedido).
    const freeBase = this.resolveBasePrice(
      items,
      cfg.freeProductId,
      productBasePrices,
    );
    const freeQty = cfg.freeQty ?? 1;
    if (freeBase === undefined || freeQty <= 0) return;
    for (const i of idx) consumed[i] = true;
    this.record(result, promo, freeBase * freeQty);
    if (!items.some((i) => i.productId === cfg.freeProductId)) {
      result.extraItems.push({
        productId: cfg.freeProductId,
        quantity: freeQty,
        promotionSlug: promo.slug,
      });
    }
  }

  // fixed_bundle: sets completos con las unidades restantes → ahorro =
  // Σ(base × qty de componentes) − price por set. Solo cubre los base;
  // los extras de modificadores suman normal en la línea.
  private applyFixedBundle(
    promo: Promotion,
    units: Unit[],
    availableIdx: (ids: readonly string[]) => number[],
    consumed: boolean[],
    result: PromotionEvaluation,
  ): void {
    const cfg = promo.config as FixedBundleConfig;
    // qty < 1 = config inválida; además un set sin consumo haría loop
    // infinito — la guarda lo vuelve imposible.
    if (!cfg.items?.length || cfg.items.some((c) => !c.qty || c.qty < 1)) {
      return;
    }
    const perSet = this.perSetSaving(cfg, units, availableIdx);
    // ahorro ≤ 0 = bundle mal configurado (más caro que suelto) — no
    // cobrar de más al cliente: la promo no dispara.
    if (perSet === undefined || perSet <= 0) return;
    let sets = 0;
    for (;;) {
      const picks: number[] = [];
      let complete = true;
      for (const comp of cfg.items) {
        const idx = availableIdx([comp.productId]).slice(0, comp.qty);
        if (idx.length < comp.qty) {
          complete = false;
          break;
        }
        picks.push(...idx);
      }
      if (!complete) break;
      for (const i of picks) consumed[i] = true;
      sets++;
    }
    if (sets === 0) return;
    this.record(result, promo, perSet * sets);
  }

  // Ahorro de un set: Σ(basePrice × qty) − price. Los basePrice salen
  // de unidades disponibles del pedido (unitPrice − extras); si falta
  // algún componente no hay set posible.
  private perSetSaving(
    cfg: FixedBundleConfig,
    units: Unit[],
    availableIdx: (ids: readonly string[]) => number[],
  ): number | undefined {
    let sum = 0;
    for (const comp of cfg.items) {
      const idx = availableIdx([comp.productId]);
      if (idx.length < comp.qty) return undefined;
      sum += units[idx[0]].unitBase * comp.qty;
    }
    return sum - cfg.price;
  }

  // basePrice resoluble: la línea del pedido es la fuente más fiel
  // (snapshot construido ya); el mapa cubre lo no ordenado todavía.
  private resolveBasePrice(
    items: EvaluableOrderItem[],
    productId: string,
    productBasePrices: ReadonlyMap<string, number>,
  ): number | undefined {
    const line = items.find((i) => i.productId === productId);
    if (line) return this.unitBase(line);
    return productBasePrices.get(productId);
  }

  // Base del producto = unitPrice − Σ deltas de added (priceDelta ya es
  // total de línea: extra × times). Los removed tienen delta 0 — no
  // alteran la cuenta.
  private unitBase(item: EvaluableOrderItem): number {
    const deltas = item.modifiers
      .filter((m) => m.action === 'added')
      .reduce((s, m) => s + m.priceDelta, 0);
    return item.unitPrice - deltas;
  }

  private record(
    result: PromotionEvaluation,
    promo: Promotion,
    saving: number,
  ): void {
    result.discount += saving;
    result.appliedPromotions.push({
      slug: promo.slug,
      name: promo.name,
      saving,
    });
  }
}
