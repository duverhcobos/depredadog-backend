import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategorySchema } from '../../infrastructure/database/schemas/category.schema';
import { ComboItemSchema } from '../../infrastructure/database/schemas/combo-item.schema';
import { ModifierGroupSchema } from '../../infrastructure/database/schemas/modifier-group.schema';
import { ModifierOptionSchema } from '../../infrastructure/database/schemas/modifier-option.schema';
import { ProductImageSchema } from '../../infrastructure/database/schemas/product-image.schema';
import { ProductModifierGroupSchema } from '../../infrastructure/database/schemas/product-modifier-group.schema';
import { ProductModifierOptionSchema } from '../../infrastructure/database/schemas/product-modifier-option.schema';
import { ProductSchema } from '../../infrastructure/database/schemas/product.schema';
import { CatalogController } from './presentation/controllers/catalog.controller';
import { CatalogService } from './application/services/catalog.service';
import { CatalogMapper } from './application/mappers/catalog.mapper';
import { GetCatalogUseCase } from './application/use-cases/get-catalog.use-case';
import { CATALOG_REPOSITORY } from './domain/repositories/catalog.repository.interface';
import { CatalogRepository } from './infrastructure/repositories/catalog.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CategorySchema,
      ProductSchema,
      ProductImageSchema,
      ComboItemSchema,
      ModifierGroupSchema,
      ModifierOptionSchema,
      ProductModifierGroupSchema,
      ProductModifierOptionSchema,
    ]),
  ],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    CatalogMapper,
    GetCatalogUseCase,
    { provide: CATALOG_REPOSITORY, useClass: CatalogRepository },
  ],
  exports: [CATALOG_REPOSITORY],
})
export class CatalogModule { }
