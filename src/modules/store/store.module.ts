import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessHourSchema } from '../../infrastructure/database/schemas/business-hour.schema';
import { StoreSettingsSchema } from '../../infrastructure/database/schemas/store-settings.schema';
import { StoreTableSchema } from '../../infrastructure/database/schemas/store-table.schema';
import { StoreController } from './presentation/controllers/store.controller';
import { StoreService } from './application/services/store.service';
import { StoreMapper } from './application/mappers/store.mapper';
import { GetStoreConfigUseCase } from './application/use-cases/get-store-config.use-case';
import { STORE_REPOSITORY } from './domain/repositories/store.repository.interface';
import { StoreRepository } from './infrastructure/repositories/store.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StoreSettingsSchema,
      BusinessHourSchema,
      StoreTableSchema,
    ]),
  ],
  controllers: [StoreController],
  providers: [
    StoreService,
    StoreMapper,
    GetStoreConfigUseCase,
    { provide: STORE_REPOSITORY, useClass: StoreRepository },
  ],
})
export class StoreModule {}
