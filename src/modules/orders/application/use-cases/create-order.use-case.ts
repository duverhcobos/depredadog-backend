import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Address } from '../../../auth/domain/entities/address.entity';
import { AddressNotFoundException } from '../../../auth/domain/exceptions/address-not-found.exception';
import {
  type IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../../auth/domain/repositories/address.repository.interface';
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
import { OrderChannel } from '../../domain/enums/order-channel.enum';
import { OrderServiceType } from '../../domain/enums/order-service-type.enum';
import { InvalidOrderDataException } from '../../domain/exceptions/invalid-order-data.exception';
import { MinOrderAmountException } from '../../domain/exceptions/min-order-amount.exception';
import { StoreClosedException } from '../../domain/exceptions/store-closed.exception';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { OrderItemsBuilder } from '../../domain/services/order-items-builder.service';
import { OrderPromotionsApplier } from '../services/order-promotions.service';

export interface CreateOrderItemModifierCommand {
  optionId: string;
  action: 'added' | 'removed';
  times?: number;
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

@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: IPaymentGateway,
    @Inject(STORE_REPOSITORY)
    private readonly store: IStoreRepository,
    @Inject(ADDRESS_REPOSITORY)
    private readonly addresses: IAddressRepository,
    private readonly itemsBuilder: OrderItemsBuilder,
    private readonly promoApplier: OrderPromotionsApplier,
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
    // 4. Revalidación de catálogo — precios SIEMPRE de la BD (la
    // comparte con el canal presencial vía OrderItemsBuilder).
    let items = await this.itemsBuilder.build(cmd.items);
    // 4b. Motor de promociones (§027): detecta patrones elegibles sobre
    // los ítems ya construidos y puede inyectar el ítem de la casa
    // (papas gratis) — su unitPrice es real, el discount lo neta.
    const promo = await this.promoApplier.apply(items);
    items = promo.items;
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
    // 5. Reglas de servicio/pago y snapshots.
    const deliveryFee =
      cmd.serviceType === 'delivery' ? settings.deliveryFee : 0;
    // El mínimo de delivery evalúa lo que el cliente PAGA
    // (subtotal − discount), no el valor de carta del pedido.
    if (
      cmd.serviceType === 'delivery' &&
      settings.minDeliveryOrder !== null &&
      subtotal - promo.discount < settings.minDeliveryOrder
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
    order.discount = promo.discount;
    order.appliedPromotions = promo.appliedPromotions;
    order.total = subtotal + deliveryFee - promo.discount;
    order.notes = cmd.notes?.trim() || null;
    order.items = items;
    // contact_phone §024 — solo delivery; pickup lo rechaza en paso 2.
    order.contactPhone = cmd.contactPhone?.trim() || null;
    order.deliveryLocationLink = cmd.deliveryLocationLink ?? null;
    // §037.A — nacer = entrar al estado: created_at siembra la cola.
    order.statusChangedAt = now;
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
