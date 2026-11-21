import { PromotionKind } from '../enums/promotion-kind.enum';

// Config por kind — jsonb en la fila, el evaluador la interpreta según
// `kind`. Los productIds son SIEMPRE explícitos (nunca por categoría:
// una promo futura puede excluir un perro de la lista).

/** fixed_bundle — set cerrado a precio fijo.
 *  ahorro = Σ(basePrice × qty de componentes) − price; los extras de
 *  modificadores cobran aparte (el bundle solo cubre los base). */
export interface FixedBundleConfig {
  items: { productId: string; qty: number }[];
  price: number;
}

/** free_item — N..M unidades elegibles → freeQty de freeProductId a $0.
 *  `maxQty` ausente = sin tope. Si el pedido ya trae el producto el
 *  ahorro cubre su línea; si no, el ítem se auto-inyecta. */
export interface FreeItemConfig {
  eligibleProductIds: string[];
  minQty: number;
  maxQty?: number;
  freeProductId: string;
  freeQty: number;
}

/** percent_off — N+ unidades elegibles → percent% del lineTotal de
 *  esas líneas (base + modificadores), redondeado hacia abajo al
 *  múltiplo `roundDownTo`. */
export interface PercentOffConfig {
  eligibleProductIds: string[];
  minQty: number;
  percent: number;
  roundDownTo: number;
}

/** showcase — card presentacional del rail de la app: solo nombre,
 *  tagline y el precio a exhibir. El motor NO la evalúa. */
export interface ShowcaseConfig {
  items?: { productId: string; qty: number }[];
  priceLabel?: string;
}

export type PromotionConfig =
  FixedBundleConfig | FreeItemConfig | PercentOffConfig | ShowcaseConfig;

// Definición de una oferta de la carta (§027) — regla sobre el
// contenido del pedido, no un ítem vendible. El snapshot de lo que
// efectivamente se aplicó queda en orders.applied_promotions.
export class Promotion {
  id!: string;
  /** Clave estable de la oferta — la app la usa como id de la card. */
  slug!: string;
  name!: string;
  /** Eslogan de la card en el rail de Combos. */
  tagline: string | null = null;
  kind!: PromotionKind;
  config!: PromotionConfig;
  isActive = true;
  /** Orden del rail en la app. */
  sortOrder = 0;
  createdAt!: Date;
  updatedAt!: Date;
}
