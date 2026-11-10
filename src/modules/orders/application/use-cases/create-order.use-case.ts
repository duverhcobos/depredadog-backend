import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Address } from '../../../auth/domain/entities/address.entity';
import { AddressNotFoundException } from '../../../auth/domain/exceptions/address-not-found.exception';
import {
  type IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../../auth/domain/repositories/address.repository.interface';
import { ModifierOption } from '../../../catalog/domain/entities/modifier-option.entity';
import { Product } from '../../../catalog/domain/entities/product.entity';
import {
  type ICatalogRepository,
  CATALOG_REPOSITORY,
} from '../../../catalog/domain/repositories/catalog.repository.interface';
import { Payment } from '../../../payments/domain/entities/payment.entity';
import { PaymentMethod } from '../../../payments/domain/enums/payment-method.enum';
import { PaymentStatus } from '../../../payments/domain/enums/payment-status.enum';
import {
  type IPaymentGateway,
  PAYMENT_GATEWAY,
} from '../../../payments/domain/services/payment-gateway.interface';
import {
  type IStoreRepository,
  STORE_REPOSITORY,
} from '../../../store/domain/repositories/store.repository.interface';
import { StoreSchedule } from '../../../store/domain/services/store-schedule.service';
import { Order } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { OrderItemModifier } from '../../domain/entities/order-item-modifier.entity';
import { ModifierAction } from '../../domain/enums/modifier-action.enum';
import { OrderChannel } from '../../domain/enums/order-channel.enum';
import { OrderServiceType } from '../../domain/enums/order-service-type.enum';
import { InvalidOrderDataException } from '../../domain/exceptions/invalid-order-data.exception';
import { MinOrderAmountException } from '../../domain/exceptions/min-order-amount.exception';
import { OrderCatalogViolationException } from '../../domain/exceptions/order-catalog-violation.exception';
import { StoreClosedException } from '../../domain/exceptions/store-closed.exception';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';

export interface CreateOrderItemModifierCommand {
  optionId: string;
  action: 'added' | 'removed';
  replacesOptionId?: string;
}

export interface CreateOrderItemCommand {
  productId: string;
  quantity: number;
  notes?: string;
  modifiers: CreateOrderItemModifierCommand[];
}

export interface CreateOrderCommand {
  customerId: string;
  serviceType: 'pickup' | 'delivery';
  items: CreateOrderItemCommand[];
  addressId?: string;
  newAddress?: { landmark: string; neighborhood?: string };
  contactPhone?: string;
  deliveryLocationLink?: string;
  paymentMethod: 'cash' | 'transfer';
  payerPhone?: string;
  notes?: string;
  clientRequestId?: string;
}

interface OrderableOption {
  opt: ModifierOption;
  includedByDefault: boolean;
  groupSlug: string;
}

@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: IPaymentGateway,
    @Inject(CATALOG_REPOSITORY)
    private readonly catalog: ICatalogRepository,
    @Inject(STORE_REPOSITORY)
    private readonly store: IStoreRepository,
    @Inject(ADDRESS_REPOSITORY)
    private readonly addresses: IAddressRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(cmd: CreateOrderCommand): Promise<Order> {
    // 1. Idempotencia — un reintento responde la misma orden.
    if (cmd.clientRequestId) {
      const existing = await this.orders.findByClientRequest(
        cmd.customerId,
        cmd.clientRequestId,
      );
      if (existing) return existing;
    }
    // 2. Reglas de payload que el DTO no cruza (400 honestos).
    this.assertPayloadCombinations(cmd);
    // 3. Local abierto — el contrato se defiende solo.
    const [settings, hours] = await Promise.all([
      this.store.getSettings(),
      this.store.getBusinessHours(),
    ]);
    const tz = this.config.get<string>('store.timezone')!;
    const now = new Date();
    if (!settings || !StoreSchedule.isOpenNow(hours, now, tz)) {
      throw new StoreClosedException();
    }
    // 4. Revalidación de catálogo — precios SIEMPRE de la BD.
    const menu = await this.catalog.getOrderableProducts(
      cmd.items.map((i) => i.productId),
    );
    const items = this.buildValidatedItems(cmd.items, menu);
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
    // 5. Reglas de servicio/pago y snapshots.
    const deliveryFee =
      cmd.serviceType === 'delivery' ? settings.deliveryFee : 0;
    if (
      cmd.serviceType === 'delivery' &&
      settings.minDeliveryOrder !== null &&
      subtotal < settings.minDeliveryOrder
    ) {
      throw new MinOrderAmountException(settings.minDeliveryOrder);
    }
    const order = new Order();
    order.customerId = cmd.customerId;
    order.channel = OrderChannel.ONLINE;
    order.serviceType = cmd.serviceType as OrderServiceType;
    order.clientRequestId = cmd.clientRequestId ?? null;
    order.orderDate = this.businessDate(now, tz);
    order.subtotal = subtotal;
    order.deliveryFee = deliveryFee;
    order.total = subtotal + deliveryFee;
    order.notes = cmd.notes?.trim() || null;
    order.items = items;
    // contact_phone §024 — solo delivery; pickup lo rechaza en paso 2.
    order.contactPhone = cmd.contactPhone?.trim() || null;
    order.deliveryLocationLink = cmd.deliveryLocationLink ?? null;
    await this.fillDeliverySnapshot(cmd, order); // addressId XOR newAddress
    order.payment = await this.buildPayment(cmd, order.total);
    return this.orders.createAggregate(order);
  }

  // Los 400 de combinación — lo que el DTO no puede cruzar entre
  // campos hermanos.
  private assertPayloadCombinations(cmd: CreateOrderCommand): void {
    if (cmd.serviceType === 'pickup' && cmd.paymentMethod === 'cash') {
      throw new InvalidOrderDataException(
        'Pickup orders must be paid by transfer',
      );
    }
    if (cmd.serviceType === 'pickup' && cmd.contactPhone) {
      throw new InvalidOrderDataException(
        'contactPhone only applies to delivery',
      );
    }
    if (cmd.paymentMethod === 'transfer' && !cmd.payerPhone) {
      throw new InvalidOrderDataException(
        'payerPhone is required for transfer',
      );
    }
    if (cmd.paymentMethod === 'cash' && cmd.payerPhone) {
      throw new InvalidOrderDataException(
        'payerPhone only applies to transfer',
      );
    }
    if (cmd.serviceType === 'delivery') {
      if (!cmd.contactPhone) {
        throw new InvalidOrderDataException(
          'contactPhone is required for delivery',
        );
      }
      // addressId XOR newAddress — ni ambos ni ninguno.
      if (Boolean(cmd.addressId) === Boolean(cmd.newAddress)) {
        throw new InvalidOrderDataException(
          'delivery requires exactly one of addressId or newAddress',
        );
      }
    }
    if (
      cmd.serviceType === 'pickup' &&
      (cmd.addressId || cmd.newAddress || cmd.deliveryLocationLink)
    ) {
      throw new InvalidOrderDataException(
        'delivery fields do not apply to pickup',
      );
    }
  }

  // Corazón de la revalidación — por cada ítem del payload (nunca se
  // confía en precios del cliente):
  private buildValidatedItems(
    dtos: CreateOrderItemCommand[],
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
        if (m.action === 'removed') {
          if (!entry.includedByDefault || !entry.opt.isRemovable) {
            throw new OrderCatalogViolationException(
              `option ${entry.opt.name} cannot be removed`,
            );
          }
          mods.push(this.modifier(entry, 'removed', 0));
          continue;
        }
        // added — ¿extra cobrado o reemplazo gratis (§021)?
        if (!entry.opt.isAvailable) {
          throw new OrderCatalogViolationException(
            `option ${entry.opt.name} unavailable`,
          );
        }
        let delta = entry.opt.extraPrice;
        if (m.replacesOptionId) {
          const replaced = options.get(m.replacesOptionId);
          const hasRemovedRow = dto.modifiers.some(
            (x) => x.optionId === m.replacesOptionId && x.action === 'removed',
          );
          const ok =
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
        mods.push(this.modifier(entry, 'added', delta, m.replacesOptionId));
      }
      const unit =
        product.basePrice +
        mods
          .filter((m) => m.action === ModifierAction.ADDED)
          .reduce((s, m) => s + m.priceDelta, 0);
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
    dto: CreateOrderItemCommand,
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
  ): OrderItemModifier {
    const m = new OrderItemModifier();
    m.optionId = entry.opt.id;
    m.optionName = entry.opt.name;
    m.action = action as ModifierAction;
    m.priceDelta = delta;
    m.modifierGroup = entry.groupSlug;
    m.replacesOptionId = replacesOptionId ?? null;
    return m;
  }

  private async fillDeliverySnapshot(
    cmd: CreateOrderCommand,
    order: Order,
  ): Promise<void> {
    if (cmd.serviceType !== 'delivery') return;
    if (cmd.addressId) {
      const addr = await this.addresses.findByIdForUser(
        cmd.addressId,
        cmd.customerId,
      );
      if (!addr) throw new AddressNotFoundException();
      order.addressId = addr.id;
      order.deliveryAddress = this.snapshot(addr);
    } else {
      const n = cmd.newAddress!;
      order.deliveryAddress = this.snapshotText(n.landmark, n.neighborhood);
    }
  }

  // snapshot: "Casa blanca frente a la cancha (Barrio Centro)" —
  // comanda-friendly; el landmark SIEMPRE primero (§022a).
  private snapshot(addr: Address): string {
    return addr.neighborhood
      ? `${addr.landmark} (${addr.neighborhood})`
      : addr.landmark;
  }

  private snapshotText(landmark: string, neighborhood?: string): string {
    const trimmed = neighborhood?.trim();
    return trimmed ? `${landmark.trim()} (${trimmed})` : landmark.trim();
  }

  private async buildPayment(
    cmd: CreateOrderCommand,
    total: number,
  ): Promise<Payment> {
    const p = new Payment();
    p.method = cmd.paymentMethod as PaymentMethod;
    p.status = PaymentStatus.PENDING;
    p.amount = total;
    p.payerPhone = cmd.paymentMethod === 'transfer' ? cmd.payerPhone! : null;
    // Transfer = cobro por push (Nequi en prod, sim en dev): se
    // despacha ANTES de persistir — si el proveedor no lo acepta la
    // orden nace ni siquiera (fail-fast, el cliente corrige y
    // reintenta con el mismo clientRequestId). Cash no toca gateway:
    // queda pending a la confirmación del dueño.
    if (cmd.paymentMethod === 'transfer') {
      const dispatched = await this.gateway.initiatePush({
        amount: total,
        payerPhone: cmd.payerPhone!,
        referenceHint: cmd.clientRequestId ?? undefined,
      });
      p.provider = dispatched.provider;
      p.providerReference = dispatched.reference;
    }
    return p;
  }

  // Día de negocio 'YYYY-MM-DD' en la tz del local — base del reset
  // diario del consecutivo (UNIQUE(order_date, order_number)).
  private businessDate(now: Date, timeZone: string): string {
    const zoned = new Date(now.toLocaleString('en-US', { timeZone }));
    const y = zoned.getFullYear();
    const m = String(zoned.getMonth() + 1).padStart(2, '0');
    const d = String(zoned.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
