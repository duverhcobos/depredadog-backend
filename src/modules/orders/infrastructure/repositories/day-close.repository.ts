import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DayClose } from '../../domain/entities/day-close.entity';
import { type IDayCloseRepository } from '../../domain/repositories/day-close.repository.interface';

@Injectable()
export class DayCloseRepository implements IDayCloseRepository {
  constructor(
    @InjectRepository(DayClose)
    private readonly repo: Repository<DayClose>,
  ) {}

  // Dentro de la tx del cierre cuando llega `em` — el schema ES la
  // entidad de dominio (EntitySchema target), no hay mapper.
  async save(close: DayClose, em?: EntityManager): Promise<DayClose> {
    const repo = em ? em.getRepository(DayClose) : this.repo;
    return repo.save(close);
  }
}
