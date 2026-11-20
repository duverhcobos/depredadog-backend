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
  // SSL — Supabase/prod exige conexión cifrada (DB_SSL=true).
  // rejectUnauthorized:false = cifrado sin verificar la CA de Supabase
  // (su CA no está en el trust store de Node). Verificación estricta:
  // descargar el CA del dashboard Supabase y pasar `ca` aquí.
  ssl:
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
}));
