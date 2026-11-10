import { Order } from '../entities/order.entity';

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
   * Mis pedidos. bucket 'active' = pending|confirmed|preparing sin
   * paginar (acotado por naturaleza); 'history' = done|cancelled
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
}

export const ORDER_REPOSITORY = Symbol('IOrderRepository');
