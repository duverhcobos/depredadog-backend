import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DayClose } from '../../domain/entities/day-close.entity';
import {
  type IDayCloseRepository,
  DAY_CLOSE_REPOSITORY,
} from '../../domain/repositories/day-close.repository.interface';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import {
  buildDayCloseSummary,
  DayCloseSummary,
} from './preview-day-close.use-case';

export interface CloseDayCommand {
  adminId: string;
  note?: string;
}

export interface CloseDayResult extends DayCloseSummary {
  id: string;
  closedAt: Date;
  note: string | null;
}

// Todo en una tx: crea el registro → claim atómico de los terminales
// sin cerrar (done + cancelled) → snapshot al registro. Cierre vacío
// permitido (decisión del dueño): si no hay nada que cerrar, el
// registro queda con ceros como bitácora. Un doble-tap crea un
// segundo cierre vacío — comportamiento aceptado (la app lo previene
// visualmente con el estado busy).
@Injectable()
export class CloseDayUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
    @Inject(DAY_CLOSE_REPOSITORY)
    private readonly dayCloses: IDayCloseRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(cmd: CloseDayCommand): Promise<CloseDayResult> {
    return this.dataSource.transaction(async (em) => {
      const closing = new DayClose();
      closing.closedBy = cmd.adminId;
      closing.closedAt = new Date();
      closing.note = cmd.note?.trim() || null;
      const saved = await this.dayCloses.save(closing, em);

      const orders = await this.orders.claimUnclosedTerminal(saved.id, em);
      const summary = buildDayCloseSummary(orders);
      saved.orderCount = summary.orderCount;
      saved.totalAmount = summary.totalAmount;
      saved.methodBreakdown = summary.byMethod;
      saved.cancelledCount = summary.cancelledCount;
      saved.cancelledAmount = summary.cancelledAmount;
      const final = await this.dayCloses.save(saved, em);
      return {
        ...summary,
        id: final.id,
        closedAt: final.closedAt,
        note: final.note,
      };
    });
  }
}
