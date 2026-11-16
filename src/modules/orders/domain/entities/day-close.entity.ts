export interface DayCloseMethodBreakdown {
  method: string;
  count: number;
  amount: number;
}

// Registro auditable del cierre de caja del día (§022): snapshot del
// hecho — quién cerró, cuándo, cuántos entregados, total, desglose por
// método y los cancelados del periodo como contexto. No se recalcula:
// un cierre es un hecho. Los ceros son válidos (día sin entregados —
// bitácora del cierre en vacío, decisión del dueño).
export class DayClose {
  id!: string;
  closedBy!: string;
  closedAt!: Date;
  orderCount = 0;
  totalAmount = 0;
  cancelledCount = 0;
  cancelledAmount = 0;
  methodBreakdown: DayCloseMethodBreakdown[] = [];
  note: string | null = null;
  createdAt!: Date;
}
