import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Payment } from '../../../payments/domain/entities/payment.entity';
import { PaymentMethod } from '../../../payments/domain/enums/payment-method.enum';
import { PaymentStatus } from '../../../payments/domain/enums/payment-status.enum';
import {
  type IPaymentGateway,
  PAYMENT_GATEWAY,
} from '../../../payments/domain/services/payment-gateway.interface';
import { StoreTable } from '../../../store/domain/entities/store-table.entity';
import {
  type IStoreRepository,
  STORE_REPOSITORY,
} from '../../../store/domain/repositories/store.repository.interface';
import { Order } from '../../domain/entities/order.entity';
import { OrderChannel } from '../../domain/enums/order-channel.enum';
import { OrderServiceType } from '../../domain/enums/order-service-type.enum';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { InvalidOrderDataException } from '../../domain/exceptions/invalid-order-data.exception';
import { TableNotFoundException } from '../../domain/exceptions/table-not-found.exception';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import {
  OrderItemsBuilder,
  OrderItemInput,
} from '../../domain/services/order-items-builder.service';
import { OrderPromotionsApplier } from '../services/order-promotions.service';
import { AdminOrderResult } from './admin-order-results';

export interface CreateInPersonOrderCommand {
  adminId: string;
  serviceType: 'dine_in' | 'pickup';
  tableId?: string;
  items: OrderItemInput[];
  paymentMethod: 'cash' | 'transfer';
  payerPhone?: string;
  notes?: string;
}

// El dueño toma el pedido en el local — dine_in nace CONFIRMED (no
// hay "esperando confirmación del local": el local lo creó) pero la
// RECOGIDA presencial nace en pending SIEMPRE — aunque esté paga —
// porque el cliente tarda un momento en pagar en el mostrador y la
// bandeja es el aviso (decisión del dueño §036/§037.D: el cobro era
// la puerta — confirm-payment la saca de la bandeja). No evalúa
// isOpenNow ni mínimo de delivery (reglas del canal online).
@Injectable()
export class CreateInPersonOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: IPaymentGateway,
    @Inject(STORE_REPOSITORY)
    private readonly store: IStoreRepository,
    private readonly itemsBuilder: OrderItemsBuilder,
    private readonly promoApplier: OrderPromotionsApplier,
    private readonly config: ConfigService,
  ) {}

  async execute(cmd: CreateInPersonOrderCommand): Promise<AdminOrderResult> {
    // 1. Los 400 de combinación — lo que el DTO no cruza entre campos.
    this.assertPayloadCombinations(cmd);
    // 2. Mesa del dine_in — existe y está activa (404 honesto).
    const table = await this.resolveTable(cmd);
    // 3. Ítems revalidados contra catálogo — mismos 409 que online.
    let items = await this.itemsBuilder.build(cmd.items);
    // 3b. Motor de promociones (§027) — el mostrador físico cobra igual
    // que la app: mismos patrones, mismo descuento, mismos inyectados.
    const promo = await this.promoApplier.apply(items);
    items = promo.items;
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
    // 4. Agregado presencial: sin cliente, con quien lo tomó y la mesa.
    const tz = this.config.get<string>('store.timezone')!;
    const order = new Order();
    order.customerId = null;
    order.takenBy = cmd.adminId;
    order.tableId = table?.id ?? null;
    order.channel = OrderChannel.PRESENCIAL;
    order.serviceType = cmd.serviceType as OrderServiceType;
    order.status =
      cmd.serviceType === 'pickup'
        ? OrderStatus.PENDING
        : OrderStatus.CONFIRMED;
    order.orderDate = this.businessDate(new Date(), tz);
    // §037.A — nacer = entrar al estado.
    order.statusChangedAt = new Date();
    order.subtotal = subtotal;
    order.deliveryFee = 0;
    order.discount = promo.discount;
    order.appliedPromotions = promo.appliedPromotions;
    order.total = subtotal - promo.discount;
    order.notes = cmd.notes?.trim() || null;
    order.items = items;
    order.payment = await this.buildPayment(cmd, order.total);
    const saved = await this.orders.createAggregate(order);
    // Presencial no tiene cliente — la mesa ya se resolvió arriba.
    return {
      order: saved,
      tableLabel: table?.label ?? null,
      customerName: null,
    };
  }

  private assertPayloadCombinations(cmd: CreateInPersonOrderCommand): void {
    if (cmd.serviceType === 'dine_in' && !cmd.tableId) {
      throw new InvalidOrderDataException('tableId is required for dine_in');
    }
    if (cmd.serviceType === 'pickup' && cmd.tableId) {
      throw new InvalidOrderDataException('tableId only applies to dine_in');
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
  }

  // dine_in trae tableId (validado arriba); pickup retorna null.
  private async resolveTable(
    cmd: CreateInPersonOrderCommand,
  ): Promise<StoreTable | null> {
    if (cmd.serviceType !== 'dine_in') return null;
    const tables = await this.store.getTablesByIds([cmd.tableId!]);
    const table = tables[0];
    if (!table || !table.isActive) throw new TableNotFoundException();
    return table;
  }

  // Mismo pago que el canal online: cash queda pending al cobro del
  // dueño; transfer despacha el push ANTES de persistir (fail-fast —
  // si el proveedor no lo acepta la orden ni nace).
  private async buildPayment(
    cmd: CreateInPersonOrderCommand,
    total: number,
  ): Promise<Payment> {
    const p = new Payment();
    p.method = cmd.paymentMethod as PaymentMethod;
    p.status = PaymentStatus.PENDING;
    p.amount = total;
    p.payerPhone = cmd.paymentMethod === 'transfer' ? cmd.payerPhone! : null;
    if (cmd.paymentMethod === 'transfer') {
      const dispatched = await this.gateway.initiatePush({
        amount: total,
        payerPhone: cmd.payerPhone!,
      });
      p.provider = dispatched.provider;
      p.providerReference = dispatched.reference;
    }
    return p;
  }

  // Día de negocio 'YYYY-MM-DD' en la tz del local — el consecutivo
  // diario es compartido con el canal online (createAggregate lo da).
  private businessDate(now: Date, timeZone: string): string {
    const zoned = new Date(now.toLocaleString('en-US', { timeZone }));
    const y = zoned.getFullYear();
    const m = String(zoned.getMonth() + 1).padStart(2, '0');
    const d = String(zoned.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
