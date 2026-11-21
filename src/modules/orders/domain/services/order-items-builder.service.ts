import { Inject, Injectable } from '@nestjs/common';
import { ModifierOption } from '../../../catalog/domain/entities/modifier-option.entity';
import { Product } from '../../../catalog/domain/entities/product.entity';
import {
  type ICatalogRepository,
  CATALOG_REPOSITORY,
} from '../../../catalog/domain/repositories/catalog.repository.interface';
import { OrderItem } from '../entities/order-item.entity';
import { OrderItemModifier } from '../entities/order-item-modifier.entity';
import { ModifierAction } from '../enums/modifier-action.enum';
import { OrderCatalogViolationException } from '../exceptions/order-catalog-violation.exception';

export interface OrderItemModifierInput {
  optionId: string;
  action: 'added' | 'removed';
  times?: number;
  replacesOptionId?: string;
}

export interface OrderItemInput {
  productId: string;
  quantity: number;
  notes?: string;
  modifiers: OrderItemModifierInput[];
}

interface OrderableOption {
  opt: ModifierOption;
  includedByDefault: boolean;
  groupSlug: string;
}

// Revalidación de catálogo compartida por los dos canales (online y
// presencial): por cada ítem del payload — nunca se confía en precios
// del cliente — el producto existe y está disponible, las opciones son
// del producto, `added`/`removed` respetan flags y el reemplazo gratis
// (§021) es de un solo uso. Misma lógica que vivía en
// CreateOrderUseCase — extraída sin cambio de comportamiento.
// Excepción deliberada (propuesta 019, auditoría M-4): @Injectable en
// domain — es un servicio de dominio que orquesta el PUERTO de
// catálogo (interface+Symbol también viven en domain); el impl concreto
// sigue en infrastructure. Regla pragmática del codebase: domain puede
// recibir DI cuando solo depende de sus propios puertos.
@Injectable()
export class OrderItemsBuilder {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalog: ICatalogRepository,
  ) {}

  async build(items: OrderItemInput[]): Promise<OrderItem[]> {
    const menu = await this.catalog.getOrderableProducts(
      items.map((i) => i.productId),
    );
    return this.buildValidatedItems(items, menu);
  }

  // Corazón de la revalidación — por cada ítem del payload (nunca se
  // confía en precios del cliente):
  private buildValidatedItems(
    dtos: OrderItemInput[],
    menu: Product[],
  ): OrderItem[] {
    const byId = new Map(menu.map((p) => [p.id, p]));
    const items: OrderItem[] = [];
    for (const dto of dtos) {
      const product = byId.get(dto.productId);
      if (!product || !product.isAvailable) {
        throw new OrderCatalogViolationException(
          `product ${dto.productId} unavailable`,
        );
      }
      const options = this.flattenOptions(product);
      // Una opción incluida ESENCIAL agotada agota el producto (§010/011).
      if (
        [...options.values()].some(
          (o) => o.includedByDefault && o.opt.isEssential && !o.opt.isAvailable,
        )
      ) {
        throw new OrderCatalogViolationException(
          `product ${product.name} unavailable (essential out)`,
        );
      }
      const seen = new Set<string>();
      // Un removed solo financia UN reemplazo gratis — sin este set,
      // N filas added podrían reclamar la misma opción y salir todas
      // con delta 0 (bypass de precio).
      const consumedReplacements = new Set<string>();
      const mods: OrderItemModifier[] = [];
      for (const m of dto.modifiers) {
        if (seen.has(m.optionId)) {
          throw new OrderCatalogViolationException('duplicate modifier');
        }
        seen.add(m.optionId);
        const entry = options.get(m.optionId);
        if (!entry) {
          throw new OrderCatalogViolationException(
            `option ${m.optionId} not for product`,
          );
        }
        const times = m.times ?? 1;
        // El builder es la frontera "no se confía en el cliente" (§026,
        // hallazgo de auditoría): times debe ser entero ≥ 1 — el DTO lo
        // valida hoy, pero un caller futuro (seed/job/test) podría
        // bypasearlo e inyectar extras gratis o descuentos negativos.
        if (!Number.isInteger(times) || times < 1) {
          throw new OrderCatalogViolationException(
            `option ${entry.opt.name} invalid times`,
          );
        }
        if (m.action === 'removed') {
          if (!entry.includedByDefault || !entry.opt.isRemovable) {
            throw new OrderCatalogViolationException(
              `option ${entry.opt.name} cannot be removed`,
            );
          }
          if (times !== 1) {
            throw new OrderCatalogViolationException(
              `option ${entry.opt.name} removed must be times=1`,
            );
          }
          mods.push(this.modifier(entry, 'removed', 0));
          continue;
        }
        // added — ¿extra cobrado o reemplazo gratis (§021)? La porción
        // repetida (§026) multiplica el delta; el cambio gratis sigue
        // siendo 1:1.
        if (!entry.opt.isAvailable) {
          throw new OrderCatalogViolationException(
            `option ${entry.opt.name} unavailable`,
          );
        }
        let delta = entry.opt.extraPrice * times;
        if (m.replacesOptionId) {
          const replaced = options.get(m.replacesOptionId);
          const hasRemovedRow = dto.modifiers.some(
            (x) => x.optionId === m.replacesOptionId && x.action === 'removed',
          );
          const ok =
            times === 1 &&
            replaced?.includedByDefault &&
            replaced.opt.isReplaceable &&
            entry.opt.isReplacementEligible &&
            hasRemovedRow &&
            !consumedReplacements.has(m.replacesOptionId);
          if (!ok) {
            throw new OrderCatalogViolationException(
              `invalid free replacement of ${entry.opt.name}`,
            );
          }
          consumedReplacements.add(m.replacesOptionId);
          delta = 0;
        }
        mods.push(
          this.modifier(entry, 'added', delta, m.replacesOptionId, times),
        );
      }
      const unit =
        product.basePrice +
        mods
          .filter((m) => m.action === ModifierAction.ADDED)
          .reduce((s, m) => s + m.priceDelta, 0);
      // quantity entero ≥1 — el DTO de la API lo valida, pero callers
      // internos (inyección de ítems gratis de promos) lo bypasean.
      if (!Number.isInteger(dto.quantity) || dto.quantity < 1) {
        throw new OrderCatalogViolationException(
          `Cantidad inválida para ${product.slug}: ${dto.quantity}`,
        );
      }
      // OrderItem con snapshots — el producto puede renombrarse o
      // cambiar de precio después.
      const item = new OrderItem();
      item.productId = product.id;
      item.productName = product.name;
      item.productSlug = product.slug;
      item.includedNames = this.effectiveIncluded(options, dto);
      item.unitPrice = unit;
      item.quantity = dto.quantity;
      item.lineTotal = unit * dto.quantity;
      item.notes = dto.notes?.trim() || null;
      item.modifiers = mods;
      items.push(item);
    }
    return items;
  }

  // {optionId → {opt, includedByDefault}} aplanado de todos los grupos
  // enlazados del producto.
  private flattenOptions(product: Product): Map<string, OrderableOption> {
    const options = new Map<string, OrderableOption>();
    for (const g of product.modifierGroups) {
      for (const opt of g.options) {
        options.set(opt.id, {
          opt,
          includedByDefault: opt.includedByDefault,
          groupSlug: g.slug,
        });
      }
    }
    return options;
  }

  // "Lleva:" efectivo — incluidos por defecto de TODOS los grupos
  // menos los quitados/reemplazados (el replaced siempre trae fila
  // removed — validado arriba — así que un solo set alcanza).
  private effectiveIncluded(
    options: Map<string, OrderableOption>,
    dto: OrderItemInput,
  ): string[] {
    const removed = new Set(
      dto.modifiers
        .filter((m) => m.action === 'removed')
        .map((m) => m.optionId),
    );
    const names: string[] = [];
    for (const { opt, includedByDefault } of options.values()) {
      if (includedByDefault && !removed.has(opt.id)) names.push(opt.name);
    }
    return names;
  }

  private modifier(
    entry: OrderableOption,
    action: 'added' | 'removed',
    delta: number,
    replacesOptionId?: string,
    times = 1,
  ): OrderItemModifier {
    const m = new OrderItemModifier();
    m.optionId = entry.opt.id;
    m.optionName = entry.opt.name;
    m.action = action as ModifierAction;
    m.priceDelta = delta;
    m.times = times;
    m.modifierGroup = entry.groupSlug;
    m.replacesOptionId = replacesOptionId ?? null;
    return m;
  }
}
