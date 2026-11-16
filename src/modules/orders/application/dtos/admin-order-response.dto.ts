import { OrderResponseDto } from './order-response.dto';

// Vista del dueño: lo que ve el cliente + datos operativos que la
// respuesta pública oculta a propósito (canal, mesa, quién pidió).
export class AdminOrderResponseDto extends OrderResponseDto {
  channel!: string;
  tableLabel!: string | null;
  customerName!: string | null;
  /** Desglose de la dirección del domicilio (§037.B) — resueltos
   * desde addresses cuando addressId existe; null si el pedido fue
   * tomado por teléfono sin ficha (deliveryAddress crudo es el
   * fallback). */
  deliveryAddressLabel!: string | null;
  deliveryLandmark!: string | null;
  deliveryNeighborhood!: string | null;
}

export class AdminOrderListResponseDto {
  items!: AdminOrderResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
