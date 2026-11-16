import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  FindOptionsWhere,
  In,
  IsNull,
  Not,
  Repository,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Payment } from '../../../payments/domain/entities/payment.entity';
import { Order } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { OrderItemModifier } from '../../domain/entities/order-item-modifier.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { PaymentStatus } from '../../../payments/domain/enums/payment-status.enum';
import {
  IOrderRepository,
  OrderListPage,
} from '../../domain/repositories/order.repository.interface';

const ACTIVE_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
];
const HISTORY_STATUSES = [OrderStatus.DONE, OrderStatus.CANCELLED];

@Injectable()
export class OrderRepository implements IOrderRepository {
  constructor(
    @InjectRepository(Order)
    private readonly orm: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly items: Repository<OrderItem>,
    @InjectRepository(OrderItemModifier)
    private readonly modifiers: Repository<OrderItemModifier>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
  ) {}

  async findByClientRequest(
    customerId: string,
    clientRequestId: string,
  ): Promise<Order | null> {
    const row = await this.orm.findOne({
      where: { customerId, clientRequestId },
    });
    if (!row) return null;
    // El reintento responde la misma orden completa (ítems + payment).
    return this.findByIdForCustomer(row.id, customerId);
  }

  // El agregado en UNA transacción: orders → items → modifiers →
  // payment. La colisión del consecutivo diario (uq_orders_day_number)
  // reintenta con transacción NUEVA — Postgres aborta la tx al primer
  // error, así que el retry vive fuera del transaction(). La colisión
  // de uq_orders_client_request NO reintenta: otro request concurrente
  // ganó la carrera de idempotencia y devolvemos su orden (el 23505
  // espera a que la tx concurrente termine — su commit ya es visible).
  async createAggregate(order: Order): Promise<Order> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.orm.manager.transaction(async (em) => {
          order.orderNumber = await this.nextNumber(em, order.orderDate);
          const saved = await em.save(order);
          for (const item of order.items) {
            item.orderId = saved.id;
            const savedItem = await em.save(item);
            for (const mod of item.modifiers) {
              mod.orderItemId = savedItem.id;
              await em.save(mod);
            }
          }
          if (order.payment) {
            order.payment.orderId = saved.id;
            order.payment = await em.save(order.payment);
          }
          saved.items = order.items;
          saved.payment = order.payment;
          return saved;
        });
      } catch (e) {
        lastError = e;
        if (
          isConstraintViolation(e, 'uq_orders_client_request') &&
          order.customerId &&
          order.clientRequestId
        ) {
          const existing = await this.findByClientRequest(
            order.customerId,
            order.clientRequestId,
          );
          if (existing) return existing;
        }
        if (
          attempt === 2 ||
          !isConstraintViolation(e, 'uq_orders_day_number')
        ) {
          throw e;
        }
      }
    }
    throw lastError;
  }

  // Consecutivo diario: MAX+1 protegido por UNIQUE(order_date,
  // order_number) — la unique es la verdad, la colisión reintenta.
  private async nextNumber(
    em: EntityManager,
    orderDate: string,
  ): Promise<number> {
    const row = await em.query<{ n: number }[]>(
      `SELECT COALESCE(MAX(order_number),0)+1 AS n
       FROM orders WHERE order_date = $1`,
      [orderDate],
    );
    return row[0].n;
  }

  // Dos queries batcheadas (sin N+1): orders del bucket + paginación,
  // luego items y payments WHERE order_id IN (...) y armado en memoria.
  // Items sin modifiers en el listado.
  async findByCustomer(
    customerId: string,
    bucket: 'active' | 'history',
    page: number,
    limit: number,
  ): Promise<OrderListPage> {
    const where: FindOptionsWhere<Order> = {
      customerId,
      status: In(bucket === 'active' ? ACTIVE_STATUSES : HISTORY_STATUSES),
    };
    let orders: Order[];
    let total: number;
    if (bucket === 'active') {
      orders = await this.orm.find({
        where,
        order: { createdAt: 'DESC' },
      });
      total = orders.length;
    } else {
      [orders, total] = await this.orm.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    }
    if (orders.length === 0) return { items: [], total };
    await this.attachItemsAndPayments(orders);
    return { items: orders, total };
  }

  // IDOR-safe: el where exige id + customerId — una orden ajena es
  // indistinguible de una inexistente.
  async findByIdForCustomer(
    id: string,
    customerId: string,
  ): Promise<Order | null> {
    const order = await this.orm.findOne({ where: { id, customerId } });
    if (!order) return null;
    await this.attachItemsAndPayments([order], true);
    return order;
  }

  async findByProviderReference(
    provider: string,
    reference: string,
  ): Promise<Order | null> {
    const row = await this.payments.findOne({
      where: { provider, providerReference: reference },
    });
    if (!row) return null;
    // El pago apunta a su orden — cargar el agregado por id (sin
    // filtro de cliente: el webhook no trae JWT, la referencia ES la
    // llave secreta que solo conoce quien despachó).
    const order = await this.orm.findOne({ where: { id: row.orderId } });
    if (order) order.payment = row;
    return order;
  }

  // Detalle: ítems con sus modifiers batcheados + el pago más reciente
  // por orden (reintentos dejan filas viejas — la viva es la última).
  private async attachItemsAndPayments(
    orders: Order[],
    withModifiers = false,
  ): Promise<void> {
    const orderIds = orders.map((o) => o.id);
    const [items, payments] = await Promise.all([
      this.items.find({ where: { orderId: In(orderIds) } }),
      this.payments.find({
        where: { orderId: In(orderIds) },
        order: { createdAt: 'DESC' },
      }),
    ]);
    const itemsByOrder = new Map<string, OrderItem[]>();
    for (const i of items) {
      const list = itemsByOrder.get(i.orderId) ?? [];
      list.push(i);
      itemsByOrder.set(i.orderId, list);
    }
    const paymentByOrder = new Map<string, Payment>();
    for (const p of payments) {
      if (!paymentByOrder.has(p.orderId)) paymentByOrder.set(p.orderId, p);
    }
    if (withModifiers && items.length > 0) {
      const mods = await this.modifiers.find({
        where: { orderItemId: In(items.map((i) => i.id)) },
      });
      const modsByItem = new Map<string, OrderItemModifier[]>();
      for (const m of mods) {
        const list = modsByItem.get(m.orderItemId) ?? [];
        list.push(m);
        modsByItem.set(m.orderItemId, list);
      }
      for (const i of items) {
        i.modifiers = modsByItem.get(i.id) ?? [];
      }
    }
    for (const o of orders) {
      o.items = itemsByOrder.get(o.id) ?? [];
      o.payment = paymentByOrder.get(o.id) ?? null;
    }
  }

  // Cancel atómico: claim del pago PRIMERO (mismo orden de locks que
  // resolvePaymentAggregate — payments→orders siempre, así los dos
  // flujos no se bloquean entre sí: quien gana el claim del payment
  // posee la transición). UPDATE condicional en ambas filas.
  async cancelPendingAggregate(order: Order): Promise<boolean> {
    try {
      return await this.orm.manager.transaction(async (em) => {
        if (order.payment) {
          // affected=0 es OK — el pago ya resuelto no se toca: un
          // 'paid' nunca revierte a 'failed' por un cancel tardío.
          await em.update(
            Payment,
            { id: order.payment.id, status: PaymentStatus.PENDING },
            { status: order.payment.status },
          );
        }
        const res = await em.update(
          Order,
          { id: order.id, status: OrderStatus.PENDING },
          {
            status: order.status,
            cancelReason: order.cancelReason,
            statusChangedAt: order.statusChangedAt,
          },
        );
        // Si la orden ya se movió, el centinela revierte TAMBIÉN el
        // kill del payment — un `return false` acá commitearía el
        // pago muerto dejando confirmed+failed (callejón sin salida).
        if ((res.affected ?? 0) === 0) throw new AggregateLostError();
        return true;
      });
    } catch (e) {
      if (e instanceof AggregateLostError) return false;
      throw e;
    }
  }

  // Claim del webhook: UPDATE payments WHERE status='pending' es la
  // puerta — affected=0 significa que otro resolvedor (reintento del
  // proveedor) o el cancel del cliente ganó la carrera → null y el
  // caller re-lee para responder idempotente. Con el claim ganado,
  // la orden se mueve solo si sigue pending — jamás resucita una
  // cancelada.
  async resolvePaymentAggregate(order: Order): Promise<Order | null> {
    try {
      return await this.orm.manager.transaction(async (em) => {
        const payment = order.payment!;
        const claim = await em.update(
          Payment,
          { id: payment.id, status: PaymentStatus.PENDING },
          {
            status: payment.status,
            confirmedAt: payment.confirmedAt,
            // QueryDeepPartialEntity no acepta Record plano en jsonb —
            // el cast indexado deja el tipo exacto del partial.
            providerPayload:
              payment.providerPayload as QueryDeepPartialEntity<Payment>['providerPayload'],
          },
        );
        if (claim.affected === 0) return null;
        const res = await em.update(
          Order,
          { id: order.id, status: OrderStatus.PENDING },
          {
            status: order.status,
            cancelReason: order.cancelReason,
            statusChangedAt: order.statusChangedAt,
          },
        );
        // Defensivo: la orden solo pudo moverse por un flujo que
        // primero claimea el payment — y el claim es nuestro. Si aún
        // así llega un 0, revertir TODO (claim incluido) es mejor que
        // un payment resuelto sobre una orden que no transicionó.
        if ((res.affected ?? 0) === 0) throw new AggregateLostError();
        return order;
      });
    } catch (e) {
      if (e instanceof AggregateLostError) return null;
      throw e;
    }
  }

  // Cola del dueño — misma forma que findByCustomer sin customerId
  // (las presenciales tienen customer_id NULL y aparecen igual).
  // La cocina atiende por cola de carril: active por statusChangedAt
  // ASC (§037.A); history DESC paginado igual que el del cliente.
  async findForAdmin(
    bucket: 'active' | 'history',
    page: number,
    limit: number,
  ): Promise<OrderListPage> {
    // Buckets §022: el done SIN cerrar sigue en la cola de Cocina
    // hasta el cierre de caja; history = cerrados + cancelados.
    const where: FindOptionsWhere<Order>[] =
      bucket === 'active'
        ? [
            { status: In(ACTIVE_STATUSES) },
            { status: OrderStatus.DONE, dayCloseId: IsNull() },
          ]
        : [
            { status: OrderStatus.CANCELLED },
            { status: OrderStatus.DONE, dayCloseId: Not(IsNull()) },
          ];
    let orders: Order[];
    let total: number;
    if (bucket === 'active') {
      orders = await this.orm.find({
        where,
        relations: { address: true },
        // §037.A — cada carril del kanban ordena por cuándo entró el
        // pedido a su estado, no por cuándo nació (un done recién
        // entregado no salta al tope de la cola).
        order: { statusChangedAt: 'ASC' },
      });
      total = orders.length;
    } else {
      [orders, total] = await this.orm.findAndCount({
        where,
        relations: { address: true },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    }
    if (orders.length === 0) return { items: [], total };
    await this.attachItemsAndPayments(orders);
    return { items: orders, total };
  }

  // Detalle admin: id solo (sin filtro de cliente — el dueño ve
  // cualquier orden) con ítems + modifiers: la comanda completa.
  // El join de address resuelve el desglose del domicilio (§037.B).
  async findById(id: string): Promise<Order | null> {
    const order = await this.orm.findOne({
      where: { id },
      relations: { address: true },
    });
    if (!order) return null;
    await this.attachItemsAndPayments([order], true);
    return order;
  }

  // Transición admin atómica: order.status llega SIN mutar — es la
  // guarda del WHERE (affected=0 → alguien movió la orden entre el
  // read del use-case y este write → false → 409). Si el agregado
  // trae el payment mutado a 'failed' (cancel del dueño), el pago
  // pendiente muere primero con el mismo claim condicional que
  // cancelPendingAggregate — orden de locks payments→orders siempre.
  async transitionStatus(order: Order, to: OrderStatus): Promise<boolean> {
    try {
      return await this.orm.manager.transaction(async (em) => {
        if (order.payment?.status === PaymentStatus.FAILED) {
          await em.update(
            Payment,
            { id: order.payment.id, status: PaymentStatus.PENDING },
            { status: PaymentStatus.FAILED },
          );
        }
        const res = await em.update(
          Order,
          { id: order.id, status: order.status },
          {
            status: to,
            cancelReason: order.cancelReason,
            statusChangedAt: order.statusChangedAt,
          },
        );
        // Carrera perdida (otro admin/webhook movió la orden): el
        // centinela revierte también el kill del payment — sino
        // quedaría confirmed+failed, un estado sin salida por API.
        if ((res.affected ?? 0) === 0) throw new AggregateLostError();
        return true;
      });
    } catch (e) {
      if (e instanceof AggregateLostError) return false;
      throw e;
    }
  }

  // Claim del cobro manual: un solo UPDATE condicional es atómico por
  // sí solo (un pago vivo por orden — índice parcial). affected=0 →
  // otro resolvedor ganó (webhook, doble tap del dueño) → false.
  async confirmPayment(orderId: string, adminId: string): Promise<boolean> {
    const res = await this.payments.update(
      { orderId, status: PaymentStatus.PENDING },
      {
        status: PaymentStatus.PAID,
        confirmedBy: adminId,
        confirmedAt: new Date(),
      },
    );
    return (res.affected ?? 0) > 0;
  }

  // Mesas ocupadas: pedido dine_in vivo por mesa → tableId → su
  // orderNumber (el menor — uno solo debería haber por el índice
  // parcial "mesa ocupada", el MIN es defensivo).
  async findActiveTableIds(): Promise<Map<string, number>> {
    const rows = await this.orm.query<{ table_id: string; n: number }[]>(
      `SELECT table_id, MIN(order_number) AS n
       FROM orders
       WHERE service_type = 'dine_in'
         AND status IN ('pending', 'confirmed', 'preparing', 'ready')
         AND table_id IS NOT NULL
       GROUP BY table_id`,
    );
    return new Map(rows.map((r) => [r.table_id, Number(r.n)]));
  }

  // Preview del cierre: terminales (done + cancelled) sin day_close_id,
  // con su pago vivo para el desglose por método (sin lock — es solo
  // lectura; el claim transaccional vive en claimUnclosedTerminal).
  async findUnclosedTerminal(): Promise<Order[]> {
    const rows = await this.orm.find({
      where: [
        { status: OrderStatus.DONE, dayCloseId: IsNull() },
        { status: OrderStatus.CANCELLED, dayCloseId: IsNull() },
      ],
      order: { updatedAt: 'ASC' },
    });
    await this.attachPayments(rows);
    return rows;
  }

  // Claim del cierre dentro de la tx del use-case: UPDATE ... RETURNING
  // reclama atómicamente TODO terminal sin cerrar (un segundo cierre o
  // un pedido que termina en medio no se cuela — la guarda IS NULL es
  // la puerta). Los cancelled se estampan igual para contarlos en el
  // resumen del periodo — su bucket ya era history por status.
  async claimUnclosedTerminal(
    dayCloseId: string,
    em: EntityManager,
  ): Promise<Order[]> {
    const claimed = await em
      .createQueryBuilder(Order, 'o')
      .update()
      .set({ dayCloseId })
      .where("status IN ('done','cancelled') AND day_close_id IS NULL")
      .returning('id')
      .execute();
    const ids = (claimed.raw as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return [];
    const rows = await em.getRepository(Order).find({
      where: { id: In(ids) },
      order: { updatedAt: 'ASC' },
    });
    await this.attachPayments(rows, em);
    return rows;
  }

  // Solo el pago vivo por orden (reintentos dejan filas viejas — la
  // última es la viva), dentro o fuera de una tx según `em`.
  private async attachPayments(
    orders: Order[],
    em?: EntityManager,
  ): Promise<void> {
    const repo = em ? em.getRepository(Payment) : this.payments;
    const payments = await repo.find({
      where: { orderId: In(orders.map((o) => o.id)) },
      order: { createdAt: 'DESC' },
    });
    const paymentByOrder = new Map<string, Payment>();
    for (const p of payments) {
      if (!paymentByOrder.has(p.orderId)) paymentByOrder.set(p.orderId, p);
    }
    for (const o of orders) {
      o.payment = paymentByOrder.get(o.id) ?? null;
    }
  }
}

// Centinela de rollback de los agregados: si el UPDATE de la orden
// pierde la carrera (affected=0), lanzarlo dentro de la tx revierte
// también el write previo sobre el payment. `return false` plano
// commitearía el payment muerto y dejaría el par orden/pago
// inconsistente (IMPORTANTE-1 de la auditoría §019). Error propio —
// eslint exige instancias de Error en `throw`.
class AggregateLostError extends Error {}

// 23505 = unique_violation de Postgres; el driver expone `code` y
// `constraint` (nombre de la restricción violada).
function isConstraintViolation(e: unknown, constraint: string): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: string }).code === '23505' &&
    (e as { constraint?: string }).constraint === constraint
  );
}
