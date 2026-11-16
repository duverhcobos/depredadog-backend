import { EntityManager } from 'typeorm';
import { DayClose } from '../entities/day-close.entity';

export interface IDayCloseRepository {
  save(close: DayClose, em?: EntityManager): Promise<DayClose>;
}

export const DAY_CLOSE_REPOSITORY = Symbol('IDayCloseRepository');
