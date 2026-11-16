import { EntitySchema } from 'typeorm';
import { DayClose } from '../../../modules/orders/domain/entities/day-close.entity';

// PG devuelve numeric como string — mismo transformer local de
// order.schema.ts.
const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const DayCloseSchema = new EntitySchema<DayClose>({
  name: 'DayClose',
  target: DayClose,
  tableName: 'day_closes',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    closedBy: { name: 'closed_by', type: 'uuid' },
    closedAt: { name: 'closed_at', type: 'timestamptz' },
    orderCount: { name: 'order_count', type: 'int', default: 0 },
    totalAmount: {
      name: 'total_amount',
      type: 'numeric',
      precision: 12,
      scale: 2,
      transformer: numeric,
      default: 0,
    },
    cancelledCount: { name: 'cancelled_count', type: 'int', default: 0 },
    cancelledAmount: {
      name: 'cancelled_amount',
      type: 'numeric',
      precision: 12,
      scale: 2,
      transformer: numeric,
      default: 0,
    },
    methodBreakdown: { name: 'method_breakdown', type: 'jsonb' },
    note: { type: 'text', nullable: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
  },
});
