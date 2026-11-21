import { Injectable } from '@nestjs/common';
import {
  FixedBundleConfig,
  FreeItemConfig,
  PercentOffConfig,
  Promotion,
  ShowcaseConfig,
} from '../../../promotions/domain/entities/promotion.entity';
import { PromotionKind } from '../../../promotions/domain/enums/promotion-kind.enum';
import { Category } from '../../domain/entities/category.entity';
import { ModifierGroup } from '../../domain/entities/modifier-group.entity';
import { ModifierOption } from '../../domain/entities/modifier-option.entity';
import { Product } from '../../domain/entities/product.entity';
import {
  CatalogCategoryResponseDto,
  CatalogProductResponseDto,
  CatalogPromotionResponseDto,
  CatalogResponseDto,
  ModifierGroupResponseDto,
  ModifierOptionResponseDto,
  PromotionDisplayResponseDto,
} from '../dtos/catalog-response.dto';
import { CatalogResult } from '../use-cases/get-catalog.use-case';

@Injectable()
export class CatalogMapper {
  toCatalogResponse(result: CatalogResult): CatalogResponseDto {
    const dto = new CatalogResponseDto();
    dto.categories = result.categories.map((c) => this.toCategoryResponse(c));
    dto.promotions = result.promotions.map((p) =>
      this.toPromotionResponse(p, result.productBasePrices),
    );
    return dto;
  }

  private toCategoryResponse(c: Category): CatalogCategoryResponseDto {
    const dto = new CatalogCategoryResponseDto();
    dto.id = c.id;
    dto.slug = c.slug;
    dto.name = c.name;
    dto.sortOrder = c.sortOrder;
    dto.products = c.products.map((p) => this.toProductResponse(p));
    return dto;
  }

  private toProductResponse(p: Product): CatalogProductResponseDto {
    const dto = new CatalogProductResponseDto();
    dto.id = p.id;
    dto.name = p.name;
    dto.slug = p.slug;
    dto.description = p.description;
    dto.basePrice = p.basePrice;
    dto.imageUrl = p.images.find((i) => i.isPrimary)?.imageUrl ?? null;
    dto.isAvailable = p.isAvailable;
    dto.isFeatured = p.isFeatured;
    dto.isCombo = p.isCombo;
    dto.sortOrder = p.sortOrder;
    dto.modifierGroups = p.modifierGroups.map((g) => this.toGroupResponse(g));
    return dto;
  }

  private toGroupResponse(g: ModifierGroup): ModifierGroupResponseDto {
    const dto = new ModifierGroupResponseDto();
    dto.id = g.id;
    dto.slug = g.slug;
    dto.name = g.name;
    dto.minSelect = g.minSelect;
    dto.maxSelect = g.maxSelect;
    dto.options = g.options.map((o) => this.toOptionResponse(o));
    return dto;
  }

  // Card del rail de Combos — la app pinta `display` sin entender la
  // mecánica: priceLabel formateado acá y los ids necesarios según el
  // kind (componentes para combos, elegibles para reglas de umbral).
  private toPromotionResponse(
    p: Promotion,
    productBasePrices: ReadonlyMap<string, number>,
  ): CatalogPromotionResponseDto {
    const dto = new CatalogPromotionResponseDto();
    dto.slug = p.slug;
    dto.name = p.name;
    dto.tagline = p.tagline;
    dto.kind = p.kind;
    dto.sortOrder = p.sortOrder;
    dto.display = this.promoDisplay(p, productBasePrices);
    // La regla viaja cruda — el evaluador local del carrito la
    // necesita para el preview (§046); display es solo para pintar.
    dto.config = p.config as unknown as Record<string, unknown>;
    return dto;
  }

  private promoDisplay(
    p: Promotion,
    productBasePrices: ReadonlyMap<string, number>,
  ): PromotionDisplayResponseDto {
    const dto = new PromotionDisplayResponseDto();
    switch (p.kind) {
      case PromotionKind.FIXED_BUNDLE: {
        const cfg = p.config as FixedBundleConfig;
        dto.priceLabel = cop(cfg.price);
        dto.componentProductIds = expandUnits(cfg.items);
        break;
      }
      case PromotionKind.FREE_ITEM: {
        const cfg = p.config as FreeItemConfig;
        const cheapest = Math.min(
          ...(cfg.eligibleProductIds ?? [])
            .map((id) => productBasePrices.get(id))
            .filter((x): x is number => x !== undefined),
        );
        // "desde $28.000" = el umbral mínimo más barato (minQty × el
        // elegible más barato). Sin elegibles ordenables → sin label.
        dto.priceLabel = Number.isFinite(cheapest)
          ? `desde ${cop(cheapest * cfg.minQty)}`
          : null;
        dto.eligibleProductIds = cfg.eligibleProductIds ?? [];
        dto.freeProductId = cfg.freeProductId;
        break;
      }
      case PromotionKind.PERCENT_OFF: {
        const cfg = p.config as PercentOffConfig;
        dto.priceLabel = `−${cfg.percent}%`;
        dto.eligibleProductIds = cfg.eligibleProductIds ?? [];
        break;
      }
      case PromotionKind.SHOWCASE: {
        const cfg = p.config as ShowcaseConfig;
        dto.priceLabel = cfg.priceLabel ?? null;
        if (cfg.items?.length) {
          dto.componentProductIds = expandUnits(cfg.items);
        }
        break;
      }
    }
    return dto;
  }

  private toOptionResponse(o: ModifierOption): ModifierOptionResponseDto {
    const dto = new ModifierOptionResponseDto();
    dto.id = o.id;
    dto.name = o.name;
    dto.extraPrice = o.extraPrice;
    dto.isAvailable = o.isAvailable;
    dto.includedByDefault = o.includedByDefault;
    dto.isRemovable = o.isRemovable;
    dto.sortOrder = o.sortOrder;
    dto.isReplaceable = o.isReplaceable;
    dto.isReplacementEligible = o.isReplacementEligible;
    dto.isEssential = o.isEssential;
    return dto;
  }
}

// COP estilo local: 17000 → "$17.000" (punto de miles, sin decimales —
// los precios de la carta son enteros).
function cop(n: number): string {
  return `$${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

// [{productId, qty}] → lista de unidades para armar el carrito
// (el id repetido por qty — la app agrega cada unidad como ítem).
function expandUnits(items: { productId: string; qty: number }[]): string[] {
  return items.flatMap((i) => Array.from({ length: i.qty }, () => i.productId));
}
