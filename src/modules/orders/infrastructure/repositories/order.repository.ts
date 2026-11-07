import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, In, Repository } from 'typeorm';
import { Payment } from '../../../payments/domain/entities/payment.entity';
import { Order } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { OrderItemModifier } from '../../domain/entities/order-item-modifier.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import {
  IOrderRepository,
  OrderListPage,
} from '../../domain/repositories/order.repository.interface';

const ACTIVE_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
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
  ) { }

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
    const row = (await em.query(
      `SELECT COALESCE(MAX(order_number),0)+1 AS n
       FROM orders WHERE order_date = $1`,
      [orderDate],
    )) as { n: number }[];
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

  // Cancel: cambio de estado + payment failed en una tx — sin huérfanos
  // de push.
  saveAggregate(order: Order): Promise<Order> {
    return this.orm.manager.transaction(async (em) => {
      const saved = await em.save(order);
      if (order.payment) {
        order.payment = await em.save(order.payment);
        saved.payment = order.payment;
      }
      saved.items = order.items;
      return saved;
    });
  }
}

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
