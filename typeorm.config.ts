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
  // Mismo SSL que database.config.ts — las migraciones a Supabase
  // también exigen conexión cifrada (DB_SSL=true).
  ssl:
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
