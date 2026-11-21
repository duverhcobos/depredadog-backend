import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromotionSchema } from '../../infrastructure/database/schemas/promotion.schema';
import { PROMOTION_REPOSITORY } from './domain/repositories/promotion.repository.interface';
import { PromotionEvaluator } from './domain/services/promotion-evaluator.service';
import { PromotionRepository } from './infrastructure/repositories/promotion.repository';

@Module({
  imports: [TypeOrmModule.forFeature([PromotionSchema])],
  providers: [
    PromotionEvaluator,
    { provide: PROMOTION_REPOSITORY, useClass: PromotionRepository },
  ],
  // orders evalúa al crear pedidos; catalog lista las activas para el
  // rail de Combos de la app.
  exports: [PROMOTION_REPOSITORY, PromotionEvaluator],
})
export class PromotionsModule {}
