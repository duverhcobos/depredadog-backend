// El preview (GET) y el resultado del cierre (POST) comparten el
// cuerpo; el resultado agrega id + closedAt + note. cancelledCount/
// cancelledAmount son contexto del periodo ("2 cancelados") — no
// suman al total.
export class DayCloseOrderDto {
  id!: string;
  orderNumber!: number;
  total!: number;
  paymentMethod!: string;
}

export class DayCloseMethodDto {
  method!: string;
  count!: number;
  amount!: number;
}

export class DayClosePreviewResponseDto {
  orderCount!: number;
  totalAmount!: number;
  byMethod!: DayCloseMethodDto[];
  cancelledCount!: number;
  cancelledAmount!: number;
  orders!: DayCloseOrderDto[];
}

export class DayCloseResponseDto extends DayClosePreviewResponseDto {
  id!: string;
  closedAt!: string;
  note!: string | null;
}
