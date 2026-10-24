# Propuesta: Bootstrap del backend — Config, TypeORM, filtros, logger, health

Infraestructura mínima para que el scaffold `nest new` pueda correr la app real de PCalientes: ConfigModule con validación de entorno, TypeORM + migraciones (synchronize siempre `false`), filtro global de excepciones por Strategy, throttler global, logger Winston a archivo, endpoint `/health`, y setup de e2e con BD de test.

**Sin lógica de negocio** — el módulo `auth` llega en la propuesta 002 sobre esta base.

Dependencias nuevas: `winston`, `winston-daily-rotate-file`.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `package.json` | Agregar scripts `migration:*` y deps `winston`, `winston-daily-rotate-file` |
| `typeorm.config.ts` | **Nuevo** — DataSource para CLI de migraciones |
| `src/config/env.validation.ts` | **Nuevo** — validación de env vars críticas al arrancar |
| `src/config/app.config.ts` | **Nuevo** — namespace `app` |
| `src/config/database.config.ts` | **Nuevo** — namespace `database` |
| `src/config/throttle.config.ts` | **Nuevo** — namespace `throttle` |
| `src/config/logger.config.ts` | **Nuevo** — namespace `logger` |
| `src/common/exceptions/domain.exception.ts` | **Nuevo** — clase base `DomainException` |
| `src/common/filters/handlers/exception-handler.interface.ts` | **Nuevo** — contrato Strategy |
| `src/common/filters/handlers/domain-exception.handler.ts` | **Nuevo** |
| `src/common/filters/handlers/http-exception.handler.ts` | **Nuevo** |
| `src/common/filters/handlers/throttler-exception.handler.ts` | **Nuevo** |
| `src/common/filters/handlers/unknown-error.handler.ts` | **Nuevo** |
| `src/common/filters/domain-exception.filter.ts` | **Nuevo** — `APP_FILTER` global |
| `src/common/decorators/skip-throttle.decorator.ts` | **Nuevo** — re-export estable |
| `src/common/logger/logger.service.ts` | **Nuevo** — Winston console + archivo rotativo |
| `src/common/logger/logger.module.ts` | **Nuevo** |
| `src/infrastructure/database/database.module.ts` | **Nuevo** — `TypeOrmModule.forRootAsync` |
| `src/infrastructure/health/health.controller.ts` | **Nuevo** — `GET /health` |
| `src/infrastructure/health/health.module.ts` | **Nuevo** |
| `src/app.module.ts` | Actualizar — cablear todo |
| `src/main.ts` | Actualizar — ValidationPipe, CORS, shutdown hooks, Swagger dev |
| `.env.example` | Actualizar — `CORS_ORIGIN`, `DB_SYNCHRONIZE`, `LOG_*` |
| `test/support/e2e-app.ts` | **Nuevo** — bootstrap e2e compartido (mock throttler) |
| `test/jest-e2e.json` | Actualizar — `maxWorkers: 1` |
| `test/app.e2e-spec.ts` | Actualizar — usa `support/e2e-app` |
| `test/health.e2e-spec.ts` | **Nuevo** — `GET /health` |

---

## 1. `package.json` (archivo existente — actualización)

**Ruta:** `package.json`

Agregar a `scripts`:

```json
"migration:create": "typeorm-ts-node-commonjs migration:create -d typeorm.config.ts",
"migration:generate": "typeorm-ts-node-commonjs migration:generate -d typeorm.config.ts",
"migration:run": "typeorm-ts-node-commonjs migration:run -d typeorm.config.ts",
"migration:revert": "typeorm-ts-node-commonjs migration:revert -d typeorm.config.ts",
"migration:show": "typeorm-ts-node-commonjs migration:show -d typeorm.config.ts",
```

Agregar a `dependencies`:

```json
"winston": "^3.x",
"winston-daily-rotate-file": "^5.x"
```

(`npm install winston winston-daily-rotate-file` — versiones exactas las resuelve npm, mínimo 7 días de publicadas)

## 2. `typeorm.config.ts` (archivo nuevo)

**Ruta:** `typeorm.config.ts`

DataSource para el CLI de migraciones. Lee `.env` (para la BD de test el override se hace por shell — ver `e2e-test-setup`).

```typescript
import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'pcalientes_db',
  entities: ['src/infrastructure/database/schemas/**/*.schema.ts'],
  migrations: ['src/infrastructure/database/migrations/*.ts'],
});
```

## 3. `src/config/env.validation.ts` (archivo nuevo)

**Ruta:** `src/config/env.validation.ts`

Falla rápido si falta una var crítica. `class-validator` ya está instalada.

```typescript
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsEnum(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  DB_HOST!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT!: number;

  @IsString()
  DB_USERNAME!: string;

  @IsString()
  DB_PASSWORD!: string; // puede ser vacío en dev local

  @IsString()
  DB_DATABASE!: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsInt()
  @Min(1)
  THROTTLE_TTL: number = 60;

  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = 100;

  @IsOptional()
  @IsString()
  MIGRATIONS_RUN?: string;

  @IsOptional()
  @IsString()
  DB_SYNCHRONIZE?: string;

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;

  @IsOptional()
  @IsString()
  LOG_DIR?: string;

  @IsOptional()
  @IsString()
  LOG_MAX_FILES?: string;

  @IsOptional()
  @IsString()
  LOG_MAX_SIZE?: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment variables: ${errors.toString()}`);
  }
  return validated;
}
```

## 4. `src/config/app.config.ts` (archivo nuevo)

**Ruta:** `src/config/app.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigin: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
}));
```

## 5. `src/config/database.config.ts` (archivo nuevo)

**Ruta:** `src/config/database.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'pcalientes_db',
  // migrations-workflow: el esquema cambia SOLO por migraciones
  synchronize: false,
  migrationsRun: process.env.MIGRATIONS_RUN === 'true',
}));
```

## 6. `src/config/throttle.config.ts` (archivo nuevo)

**Ruta:** `src/config/throttle.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('throttle', () => ({
  // THROTTLE_TTL llega en segundos; @nestjs/throttler trabaja en ms
  ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10) * 1000,
  limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
}));
```

## 7. `src/config/logger.config.ts` (archivo nuevo)

**Ruta:** `src/config/logger.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('logger', () => ({
  level: process.env.LOG_LEVEL ?? 'info',
  dir: process.env.LOG_DIR ?? 'logs',
  maxFiles: process.env.LOG_MAX_FILES ?? '14d',
  maxSize: process.env.LOG_MAX_SIZE ?? '20m',
}));
```

## 8. `src/common/exceptions/domain.exception.ts` (archivo nuevo)

**Ruta:** `src/common/exceptions/domain.exception.ts`

```typescript
export abstract class DomainException extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

## 9. `src/common/filters/handlers/exception-handler.interface.ts` (archivo nuevo)

**Ruta:** `src/common/filters/handlers/exception-handler.interface.ts`

```typescript
import { ArgumentsHost } from '@nestjs/common';

export interface ExceptionHandler {
  canHandle(exception: unknown): boolean;
  handle(exception: unknown, host: ArgumentsHost): void;
}
```

## 10. `src/common/filters/handlers/domain-exception.handler.ts` (archivo nuevo)

**Ruta:** `src/common/filters/handlers/domain-exception.handler.ts`

```typescript
import { ArgumentsHost, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from '../../exceptions/domain.exception';
import { ExceptionHandler } from './exception-handler.interface';

@Injectable()
export class DomainExceptionHandler implements ExceptionHandler {
  canHandle(exception: unknown): boolean {
    return exception instanceof DomainException;
  }

  handle(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const ex = exception as DomainException;
    res.status(ex.httpStatus).json({
      statusCode: ex.httpStatus,
      message: ex.message,
      timestamp: new Date().toISOString(),
    });
  }
}
```

## 11. `src/common/filters/handlers/http-exception.handler.ts` (archivo nuevo)

**Ruta:** `src/common/filters/handlers/http-exception.handler.ts`

```typescript
import { ArgumentsHost, HttpException, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { ExceptionHandler } from './exception-handler.interface';

@Injectable()
export class HttpExceptionHandler implements ExceptionHandler {
  canHandle(exception: unknown): boolean {
    return exception instanceof HttpException;
  }

  handle(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const ex = exception as HttpException;
    const status = ex.getStatus();
    const body = ex.getResponse();
    res.status(status).json(
      typeof body === 'object'
        ? { ...(body as object), timestamp: new Date().toISOString() }
        : {
            statusCode: status,
            message: ex.message,
            timestamp: new Date().toISOString(),
          },
    );
  }
}
```

## 12. `src/common/filters/handlers/throttler-exception.handler.ts` (archivo nuevo)

**Ruta:** `src/common/filters/handlers/throttler-exception.handler.ts`

```typescript
import { ArgumentsHost, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';
import { ExceptionHandler } from './exception-handler.interface';

@Injectable()
export class ThrottlerExceptionHandler implements ExceptionHandler {
  canHandle(exception: unknown): boolean {
    return exception instanceof ThrottlerException;
  }

  handle(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(429).json({
      statusCode: 429,
      message: 'Too many requests',
      timestamp: new Date().toISOString(),
    });
  }
}
```

## 13. `src/common/filters/handlers/unknown-error.handler.ts` (archivo nuevo)

**Ruta:** `src/common/filters/handlers/unknown-error.handler.ts`

Último de la cadena — atrapa todo lo demás y responde 500 sin filtrar detalle.

```typescript
import { ArgumentsHost, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { LoggerService } from '../../logger/logger.service';
import { ExceptionHandler } from './exception-handler.interface';

@Injectable()
export class UnknownErrorHandler implements ExceptionHandler {
  constructor(private readonly logger: LoggerService) {}

  canHandle(): boolean {
    return true;
  }

  handle(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
      UnknownErrorHandler.name,
    );
    res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
}
```

## 14. `src/common/filters/domain-exception.filter.ts` (archivo nuevo)

**Ruta:** `src/common/filters/domain-exception.filter.ts`

Filtro global — recorre la cadena de handlers en orden (domain → http → throttler → unknown).

```typescript
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Injectable,
} from '@nestjs/common';
import { DomainExceptionHandler } from './handlers/domain-exception.handler';
import { HttpExceptionHandler } from './handlers/http-exception.handler';
import { ThrottlerExceptionHandler } from './handlers/throttler-exception.handler';
import { UnknownErrorHandler } from './handlers/unknown-error.handler';
import { ExceptionHandler } from './handlers/exception-handler.interface';

@Catch()
@Injectable()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly handlers: ExceptionHandler[];
  private readonly fallback: ExceptionHandler;

  constructor(
    domainHandler: DomainExceptionHandler,
    throttlerHandler: ThrottlerExceptionHandler,
    httpHandler: HttpExceptionHandler,
    unknownHandler: UnknownErrorHandler,
  ) {
    // ThrottlerException extends HttpException — el más específico va antes
    // que el genérico, si no queda inalcanzable.
    this.handlers = [domainHandler, throttlerHandler, httpHandler];
    this.fallback = unknownHandler;
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const handler =
      this.handlers.find((h) => h.canHandle(exception)) ?? this.fallback;
    handler.handle(exception, host);
  }
}
```

## 15. `src/common/decorators/skip-throttle.decorator.ts` (archivo nuevo)

**Ruta:** `src/common/decorators/skip-throttle.decorator.ts`

```typescript
import { SkipThrottle as NestSkipThrottle } from '@nestjs/throttler';

// Path de import estable del proyecto — envuelve el decorador de NestJS
export const SkipThrottle = NestSkipThrottle;
```

## 16. `src/common/logger/logger.service.ts` (archivo nuevo)

**Ruta:** `src/common/logger/logger.service.ts`

Winston: consola coloreada + archivo rotativo diario en `LOG_DIR`.

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
// Default import requerido por module: nodenext (namespace no construible)
import DailyRotateFile from 'winston-daily-rotate-file';

@Injectable()
export class LoggerService {
  private readonly logger: winston.Logger;

  constructor(config: ConfigService) {
    const level = config.get<string>('logger.level')!;
    const dir = config.get<string>('logger.dir')!;
    const maxFiles = config.get<string>('logger.maxFiles')!;
    const maxSize = config.get<string>('logger.maxSize')!;

    this.logger = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
        new DailyRotateFile({
          dirname: dir,
          filename: 'app-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles,
          maxSize,
        }),
      ],
    });
  }

  log(message: string, context?: string): void {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string): void {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string): void {
    this.logger.debug(message, { context });
  }
}
```

## 17. `src/common/logger/logger.module.ts` (archivo nuevo)

**Ruta:** `src/common/logger/logger.module.ts`

```typescript
import { Global, Module } from '@nestjs/common';
import { LoggerService } from './logger.service';

@Global()
@Module({
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
```

`@Global()` justificado: el logger lo consumen filtros y cualquier módulo — no es kernel de negocio.

## 18. `src/infrastructure/database/database.module.ts` (archivo nuevo)

**Ruta:** `src/infrastructure/database/database.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host')!,
        port: config.get<number>('database.port')!,
        username: config.get<string>('database.username')!,
        password: config.get<string>('database.password')!,
        database: config.get<string>('database.database')!,
        autoLoadEntities: true,
        synchronize: false, // migrations-workflow — NUNCA true
        migrationsRun: config.get<boolean>('database.migrationsRun')!,
        migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
      }),
    }),
  ],
})
export class DatabaseModule {}
```

## 19. `src/infrastructure/health/health.controller.ts` (archivo nuevo)

**Ruta:** `src/infrastructure/health/health.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SkipThrottle } from '../../common/decorators/skip-throttle.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @SkipThrottle()
  async check() {
    const db = await this.dataSource
      .query('SELECT 1')
      .then(() => 'up')
      .catch(() => 'down');

    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
```

## 20. `src/infrastructure/health/health.module.ts` (archivo nuevo)

**Ruta:** `src/infrastructure/health/health.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

## 21. `src/app.module.ts` (archivo existente — actualización)

**Ruta:** `src/app.module.ts`

**Antes:**

```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

**Después:**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import loggerConfig from './config/logger.config';
import throttleConfig from './config/throttle.config';
import { validate } from './config/env.validation';
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
      load: [appConfig, databaseConfig, throttleConfig, loggerConfig],
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    DomainExceptionHandler,
    HttpExceptionHandler,
    ThrottlerExceptionHandler,
    UnknownErrorHandler,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
```

## 22. `src/main.ts` (archivo existente — actualización)

**Ruta:** `src/main.ts`

**Antes:**

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

**Después:**

```typescript
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true, // IDOR: campos inesperados = 400, no se ignoran
      transform: true,
    }),
  );

  app.enableCors({
    origin: config.get<string[]>('app.corsOrigin')!,
    credentials: true,
  });

  // code-patterns: TypeORM cierra el pool de Postgres solo al apagar
  app.enableShutdownHooks();

  if (!config.get<boolean>('app.isProduction')!) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('PCalientes API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.get<number>('app.port')!);
}
bootstrap();
```

## 23. `.env.example` (archivo existente — actualización)

**Ruta:** `.env.example`

**Antes:**

```dotenv
# Migraciones al arrancar (true solo en dev/test local)
MIGRATIONS_RUN=true

# Throttling global
THROTTLE_TTL=60
THROTTLE_LIMIT=100
```

**Después:**

```dotenv
# Migraciones al arrancar (true solo en dev/test local)
MIGRATIONS_RUN=true

# Esquema vía synchronize — SIEMPRE false, las migraciones mandan (migrations-workflow)
DB_SYNCHRONIZE=false

# CORS — orígenes permitidos separados por coma (sin default '*')
# Ejemplo para panel admin futuro: http://localhost:5173
CORS_ORIGIN=

# Throttling global
THROTTLE_TTL=60
THROTTLE_LIMIT=100

# Logger Winston (archivo rotativo en LOG_DIR)
LOG_LEVEL=info
LOG_DIR=logs
LOG_MAX_FILES=14d
LOG_MAX_SIZE=20m
```

## 24. `test/support/e2e-app.ts` (archivo nuevo)

**Ruta:** `test/support/e2e-app.ts`

Única fuente del bootstrap de e2e (ver `e2e-test-setup`): mock del `ThrottlerGuard` global por prototipo — los specs que disparen varios requests no reciben 429 falsos.

```typescript
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module';

let throttlerGuardSpy: jest.SpyInstance;

export async function createE2EApp(): Promise<INestApplication> {
  throttlerGuardSpy = jest
    .spyOn(ThrottlerGuard.prototype, 'canActivate')
    .mockResolvedValue(true);

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  // El pipe global vive en main.ts — los e2e no pasan por ahí, se aplica acá
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  return app;
}

export function restoreThrottler(): void {
  throttlerGuardSpy?.mockRestore();
}
```

## 25. `test/jest-e2e.json` (archivo existente — actualización)

**Ruta:** `test/jest-e2e.json`

**Antes:**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  }
}
```

**Después:** agregar `maxWorkers: 1` — la BD de test compartida no tolera specs en paralelo.

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "maxWorkers": 1
}
```

## 26. `test/app.e2e-spec.ts` (archivo existente — actualización)

**Ruta:** `test/app.e2e-spec.ts`

**Antes:** usa `Test.createTestingModule` directo sin `support/e2e-app`.

**Después:**

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2EApp, restoreThrottler } from './support/e2e-app';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createE2EApp();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });
});
```

## 27. `test/health.e2e-spec.ts` (archivo nuevo)

**Ruta:** `test/health.e2e-spec.ts`

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2EApp, restoreThrottler } from './support/e2e-app';

describe('GET /health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createE2EApp();
  });

  it('devuelve estado de la app y de la BD', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ db: 'up' });
    expect(res.body.status).toBe('ok');
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });
});
```

---

## Prerequisitos manuales (una sola vez)

1. Copiar `.env.example` → `.env` con credenciales reales de Postgres.
2. Copiar `.env.example` → `.env.test` con `DB_DATABASE=pcalientes_db_test`.
3. Crear las bases: `CREATE DATABASE pcalientes_db;` y `CREATE DATABASE pcalientes_db_test;`.
4. `npm install` (instala winston + winston-daily-rotate-file).

## Orden de aplicación recomendado

1. `package.json` (scripts + deps) → `npm install`
2. `typeorm.config.ts`
3. `src/config/` (4 archivos + env.validation)
4. `src/common/` (exception, handlers, filter, decorator, logger)
5. `src/infrastructure/database/` + `src/infrastructure/health/`
6. `src/app.module.ts` + `src/main.ts`
7. `.env.example`
8. `test/` (support, jest-e2e.json, specs)
9. Verificación: `npm run build` → `npm run test` → `npm run test:e2e` → `npm run start:dev` y `GET http://localhost:3000/health`

## Decisiones embebidas (para la encuesta)

- Winston con `winston-daily-rotate-file` (no nest-winston) — servicio plano sin acoplar a Nest logger.
- `synchronize` hardcodeado a `false` en el factory (ni siquiera lee `DB_SYNCHRONIZE`) — la env var queda solo documentada.
- `envFilePath` por `NODE_ENV` — `.env.test` obligatorio para `test:e2e`.
- `ThrottlerGuard` global `APP_GUARD` — toda ruta rate-limited salvo `@SkipThrottle()`.
- `/health` con `@SkipThrottle()` — el load balancer puede golpearla sin contar contra el límite.
- Swagger solo fuera de producción, en `/api/docs`.
- Se conserva `AppController`/`AppService` default (`GET /` hello world) — se remueven cuando exista el primer módulo.
