import { OrderResponseDto } from './order-response.dto';

// Vista del dueño: lo que ve el cliente + datos operativos que la
// respuesta pública oculta a propósito (canal, mesa, quién pidió).
export class AdminOrderResponseDto extends OrderResponseDto {
  channel!: string;
  tableLabel!: string | null;
  customerName!: string | null;
}

export class AdminOrderListResponseDto {
  items!: AdminOrderResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
