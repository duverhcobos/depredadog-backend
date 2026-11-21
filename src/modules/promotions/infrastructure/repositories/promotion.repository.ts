import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Promotion } from '../../domain/entities/promotion.entity';
import { IPromotionRepository } from '../../domain/repositories/promotion.repository.interface';

@Injectable()
export class PromotionRepository implements IPromotionRepository {
  constructor(
    @InjectRepository(Promotion)
    private readonly orm: Repository<Promotion>,
  ) {}

  // Solo activas, en orden del rail — las inactivas no se evalúan ni
  // se muestran en el GET /catalog.
  findActive(): Promise<Promotion[]> {
    return this.orm.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }
}
