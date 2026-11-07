import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import emailConfig from './config/email.config';
import loggerConfig from './config/logger.config';
import storeConfig from './config/store.config';
import throttleConfig from './config/throttle.config';
import { validate } from './config/env.validation';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { OrdersModule } from './modules/orders/orders.module';
import { StoreModule } from './modules/store/store.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { DomainExceptionHandler } from './common/filters/handlers/domain-exception.handler';
import { HttpExceptionHandler } from './common/filters/handlers/http-exception.handler';
import { ThrottlerExceptionHandler } from './common/filters/handlers/throttler-exception.handler';
import { UnknownErrorHandler } from './common/filters/handlers/unknown-error.handler';
import { LoggerModule } from './common/logger/logger.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './infrastructure/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // e2e-test-setup: NODE_ENV=test carga .env.test (BD de test separada)
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      load: [
        appConfig,
        authConfig,
        databaseConfig,
        emailConfig,
        throttleConfig,
        loggerConfig,
        storeConfig,
      ],
      validate,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttl')!,
            limit: config.get<number>('throttle.limit')!,
          },
        ],
      }),
    }),
    LoggerModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    StoreModule,
    OrdersModule,
  ],
  providers: [
    DomainExceptionHandler,
    HttpExceptionHandler,
    ThrottlerExceptionHandler,
    UnknownErrorHandler,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule { }
