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
  /** Persiste el cambio de estado + payment del cancel en una tx. */
  saveAggregate(order: Order): Promise<Order>;
}

export const ORDER_REPOSITORY = Symbol('IOrderRepository');
