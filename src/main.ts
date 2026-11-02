import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(compression());

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
      .setTitle('Depredadog API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.get<number>('app.port')!);
}
void bootstrap();
