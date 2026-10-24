# Pendiente: Migrar la base de datos a Supabase para producción

> **Estado: 🔴 PENDIENTE** — Desarrollo corre sobre PostgreSQL local (`localhost:5432`); producción apunta a Supabase.
> **Producto:** backend
> **Bloqueo:** bloqueante

## Estado actual (workaround vigente)

Toda la infraestructura de datos corre contra el Postgres local de desarrollo:

- `DB_HOST=localhost`, `DB_PORT=5432`, `DB_USERNAME=postgres` en `.env`/`.env.test`
- Bases creadas a mano: `pcalientes_db`, `pcalientes_db_test`
- Sin SSL en la conexión (local no lo necesita)

## Qué falta

Decidir y configurar la conexión a Supabase en producción:

1. Crear el proyecto Supabase y obtener credenciales (host `db.<ref>.supabase.co`, puerto 5432 directo o 6543 pooled).
2. Variables de entorno de producción: `DB_*` apuntando a Supabase + `DB_SSL=true` (Supabase exige SSL — el `database.config.ts` actual no modela SSL, se agrega cuando toque).
3. Decidir **pooler vs conexión directa**: Supabase recomienda el pooler (pgbouncer, puerto 6543) para serverless; las migraciones de TypeORM deben ir por conexión directa (5432).
4. Definir cómo corren `npm run migration:*` en producción — el `typeorm.config.ts` apunta a lo que diga el `.env` activo.
5. Evaluar si se usa Supabase Auth/Storage o solo Postgres como base de datos (afecta si el módulo auth propio se mantiene o se adapta).
6. Revisar compatibilidad: Supabase trae extensiones (`uuid-ossp`, `pgcrypto` disponibles) — la extensión para `gen_random_uuid()` ya viene habilitada en Supabase.

## Camino de resolución

- Propuesta de configuración de producción cuando se acerque el deploy (env vars + SSL + pooler).
- Posible nueva var `DB_SSL` / `DATABASE_URL` en `env-secrets` y `typeorm.config.ts`.
- Los `.env`/`.env.test` locales se mantienen para desarrollo — no cambian.

## Criterio de cierre

- La app corre migraciones y sirve requests contra la BD de Supabase en un entorno de staging/producción.
- `documentacion/modelo-de-datos.md` o el `env-secrets` reflejan la configuración real de producción.
