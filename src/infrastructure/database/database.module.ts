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
        ssl: config.get('database.ssl'),
      }),
    }),
  ],
})
export class DatabaseModule {}
