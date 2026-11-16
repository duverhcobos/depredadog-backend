import { EntityManager } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderStatus } from '../enums/order-status.enum';

export interface OrderListPage {
  items: Order[];
  total: number;
}

export interface IOrderRepository {
  /**
   * Busca una orden del cliente por su client_request_id — la
   * idempotencia del POST la resuelve el use-case ANTES de crear.
   */
  findByClientRequest(
    customerId: string,
    clientRequestId: string,
  ): Promise<Order | null>;
  /**
   * Persiste el agregado completo (orders + items + modifiers +
   * payment inicial) en UNA transacción. El consecutivo diario se
   * calcula adentro: SELECT MAX(order_number)+1 WHERE order_date
   * — la UNIQUE(order_date, order_number) es la verdad; una
   * colisión reintenta hasta 3 veces.
   */
  createAggregate(order: Order): Promise<Order>;
  /**
   * Mis pedidos. bucket 'active' = pending|confirmed|preparing|ready
   * sin paginar (acotado por naturaleza); 'history' = done|cancelled
   * paginado. Incluye items (sin modifiers) + payment en ambos —
   * la card muestra ítems y el chip de pago.
   */
  findByCustomer(
    customerId: string,
    bucket: 'active' | 'history',
    page: number,
    limit: number,
  ): Promise<OrderListPage>;
  /** IDOR-safe: null si no existe O si no es del cliente. */
  findByIdForCustomer(id: string, customerId: string): Promise<Order | null>;
  /**
   * Orden dueña del pago vivo con esa referencia de proveedor —
   * el webhook la resuelve por (provider, provider_reference).
   * Carga el payment; ítems no hacen falta para la transición.
   */
  findByProviderReference(
    provider: string,
    reference: string,
  ): Promise<Order | null>;
  /**
   * Cancel atómico (code-patterns "consumo atómico"): en UNA tx —
   * 1) UPDATE payments SET <estado del agregado> WHERE id AND
   * status='pending' (claim condicional: un pago ya pagado nunca
   * revierte a failed); 2) UPDATE orders WHERE id AND
   * status='pending'. false = la orden ya no estaba pending (el
   * webhook de pago ganó la carrera → el use-case traduce a
   * OrderNotCancellable). El orden de locks es SIEMPRE
   * payments→orders, igual que resolvePaymentAggregate — sin
   * deadlock entre los dos flujos.
   */
  cancelPendingAggregate(order: Order): Promise<boolean>;
  /**
   * Resolución del webhook de pagos — claim atómico: UPDATE payments
   * WHERE id AND status='pending' es el gate; affected=0 → otro
   * resolvedor ganó (reintento del proveedor o el cancel del
   * cliente) → null y el use-case re-lee para responder idempotente.
   * Si el claim gana, la orden se mueve WHERE status='pending' —
   * una orden cancelada nunca se resucita.
   */
  resolvePaymentAggregate(order: Order): Promise<Order | null>;
  /**
   * Cola del dueño — sin filtro de cliente (presenciales con NULL).
   * Buckets (§022):
   * - active  = pending/confirmed/preparing/ready + done SIN cerrar
   *             (el entregado sigue en Cocina hasta el cierre de caja)
   * - history = done con day_close_id + cancelled (cualquier fecha)
   */
  findForAdmin(
    bucket: 'active' | 'history',
    page: number,
    limit: number,
  ): Promise<OrderListPage>;
  /** Pedidos terminales (done/cancelled) sin cerrar — preview (sin lock). */
  findUnclosedTerminal(): Promise<Order[]>;
  /**
   * Claim atómico del cierre: UPDATE orders SET day_close_id
   * WHERE status IN ('done','cancelled') AND day_close_id IS NULL
   * dentro de `em`, luego devuelve las filas reclamadas con su
   * payment cargado. Los cancelled se estampan para atarlos al
   * periodo del cierre (contexto "N cancelados" del resumen) — ya
   * vivían en historial por su status.
   */
  claimUnclosedTerminal(
    dayCloseId: string,
    em: EntityManager,
  ): Promise<Order[]>;
  /** Vista del dueño — id solo, sin filtro de customer. */
  findById(id: string): Promise<Order | null>;
  /**
   * Transición admin atómica: UPDATE orders SET status/cancelReason
   * WHERE id AND status=<estado leído>. false → alguien movió la orden
   * entre read y write → 409 (patrón consumo atómico). Si el agregado
   * trae el payment mutado a 'failed' (cancel del dueño), el pago
   * pendiente muere en la misma tx — mismo orden de locks
   * payments→orders que cancelPendingAggregate/resolvePaymentAggregate.
   */
  transitionStatus(order: Order, to: OrderStatus): Promise<boolean>;
  /**
   * Claim del cobro manual: UPDATE payments SET paid, confirmed_by,
   * confirmed_at WHERE order_id AND status='pending'. false → ya
   * resuelto (idempotente si era paid; 409 si failed/refunded).
   */
  confirmPayment(orderId: string, adminId: string): Promise<boolean>;
  /** Mesas con pedido dine_in vivo → tableId → orderNumber. */
  findActiveTableIds(): Promise<Map<string, number>>;
}

export const ORDER_REPOSITORY = Symbol('IOrderRepository');
