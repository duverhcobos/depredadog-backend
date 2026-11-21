export class ModifierOptionResponseDto {
  id!: string;
  name!: string;
  extraPrice!: number;
  isAvailable!: boolean;
  includedByDefault!: boolean;
  isRemovable!: boolean;
  sortOrder!: number;
  isReplaceable!: boolean;
  isReplacementEligible!: boolean;
  isEssential!: boolean;
}

export class ModifierGroupResponseDto {
  id!: string;
  slug!: string;
  name!: string;
  minSelect!: number;
  maxSelect!: number | null;
  options!: ModifierOptionResponseDto[];
}

export class CatalogProductResponseDto {
  id!: string;
  name!: string;
  slug!: string;
  description!: string | null;
  basePrice!: number;
  imageUrl!: string | null;
  isAvailable!: boolean;
  isFeatured!: boolean;
  isCombo!: boolean;
  sortOrder!: number;
  modifierGroups!: ModifierGroupResponseDto[];
}

export class CatalogCategoryResponseDto {
  id!: string;
  slug!: string;
  name!: string;
  sortOrder!: number;
  products!: CatalogProductResponseDto[];
}

/** Bloque visual de la card de promo (§027) — la app pinta sin
 *  interpretar la mecánica del `kind`. */
export class PromotionDisplayResponseDto {
  /** Precio/oferta ya formateado para la card: "$17.000",
   *  "desde $28.000", "−15%" — null si no se pudo derivar. */
  priceLabel!: string | null;
  /** `fixed_bundle`/`showcase`: unidades para armar el carrito
   *  (el productId se repite según qty del set). */
  componentProductIds?: string[];
  /** `free_item`/`percent_off`: productos que activan la regla. */
  eligibleProductIds?: string[];
  /** `free_item`: el producto que sale gratis al cumplir la regla. */
  freeProductId?: string;
}

export class CatalogPromotionResponseDto {
  slug!: string;
  name!: string;
  tagline!: string | null;
  /** `fixed_bundle` | `free_item` | `percent_off` | `showcase`. */
  kind!: string;
  sortOrder!: number;
  display!: PromotionDisplayResponseDto;
  /** Config cruda de la regla — el evaluador local del carrito la
   *  replica para el preview (§046); el servidor re-valida igual. */
  config!: Record<string, unknown>;
}

export class CatalogResponseDto {
  categories!: CatalogCategoryResponseDto[];
  /** Rail de Combos de la app — solo activas, por sort_order. */
  promotions!: CatalogPromotionResponseDto[];
}
