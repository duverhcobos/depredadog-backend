---
name: rls-tenant-isolation
description: Row Level Security (RLS) de PostgreSQL como segunda capa de aislamiento multi-tenant — cuándo y cómo aplicarla al crear tablas o migraciones de este backend
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

# Row Level Security (RLS) — aislamiento multi-tenant a nivel base de datos

Esta convención aplica cuando el proyecto es un **SaaS multi-tenant**: cada organización solo puede ver sus propios datos. El aislamiento se aplica en **dos capas independientes** — la idea es que ambas tengan que fallar a la vez para que un usuario vea datos de otra organización:

1. **Capa de aplicación**: toda query filtra por `tenant_id` del JWT de la sesión (ver skill `idor-checklist` — `WHERE id = ? AND tenant_id = ?`, nunca solo por `id`). El `tenant_id` siempre sale del token firmado, nunca del request del cliente.
2. **Capa de base de datos — RLS**: política nativa de PostgreSQL que bloquea filas de otras organizaciones **aunque el código de la aplicación se olvide del filtro**.

## Cómo funciona la estrategia

- **Cada tabla de negocio** tiene `tenant_id UUID NOT NULL REFERENCES organizations(id)` (o la tabla de tenant equivalente).
- Sobre cada tabla con `tenant_id` se activa RLS con una política que compara la columna contra un parámetro de sesión de Postgres (`app.current_org`):

  ```sql
  ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
  CREATE POLICY orders_tenant_isolation ON orders
      USING (tenant_id = current_setting('app.current_org')::uuid);
  ```

- **La aplicación ejecuta `SET app.current_org = '<uuid>'` al inicio de cada sesión/transacción**, tomando el `tenant_id` del JWT autenticado — nunca de un header, query param o body del cliente.

## Implementación típica (a montar con el esquema)

- **Propagación**: un interceptor global (ej. `TenantDbInterceptor`, después del que resuelve el contexto de tenant) hace checkout de una conexión dedicada del pool en cada request tenant-scoped, corre `SELECT set_config('app.current_org', $1, false)` a nivel sesión y la libera con `RESET` al final. Los repos de negocio leen el manager del tenant (vía AsyncLocalStorage) — **nunca `dataSource` directo** (eso saltaría el GUC → fail-closed silencioso).
- **Rol dedicado**: la app runtime conecta como `DB_APP_USERNAME`/`DB_APP_PASSWORD` (rol sin superuser, ej. `app_role`) — RLS no aplica a owner ni superuser ni con `FORCE`. Migraciones siguen con `DB_USERNAME` (owner).
- **Tablas hijas sin `organization_id`** propio: política `FOR ALL USING/WITH CHECK (EXISTS (... padre con organization_id ...))` — la RLS del padre aplica dentro del subquery.
- **Fail-closed**: `NULLIF(current_setting('app.current_org', true), '')::uuid` — GUC ausente o vacío → NULL → comparación falsa → 0 filas sin error.
- También conviene `FORCE ROW LEVEL SECURITY` para que ni siquiera el owner de la tabla se salte la política, y decidir cómo se exime el rol de superadmin/migraciones (rol `BYPASSRLS` o una política permisiva separada) — definirlo en la propuesta que implemente el esquema inicial.

## Cuándo aplicar esta skill

- Al crear la **migración inicial del esquema** (tenants/usuarios/tablas de negocio): incluir `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` por cada tabla con `tenant_id`.
- Al crear **cualquier tabla nueva de negocio**: la migración debe incluir la política RLS correspondiente, igual que incluye la columna `tenant_id`.
- Al escribir el **provider de conexión TypeORM** que propague `SET app.current_org` por request/transacción (cuidado con connection pooling: el `SET` debe hacerse por transacción o por conexión aislada, no al inicializar el pool global, o las consultas de un tenant contaminarían la conexión reusada por otro).
- Al revisar propuestas: una propuesta que agrega una tabla de negocio **sin RLS está incompleta** — si el proyecto es multi-tenant.

## Advertencias

- **RLS no reemplaza el filtro en la aplicación**: es defensa en profundidad, no sustituto. El filtro `WHERE tenant_id = ...` sigue siendo obligatorio en cada query (skill `idor-checklist`) — también por legibilidad del código y porque los tests unitarios no ejercitan Postgres.
- **Las migraciones y seeds corren con un rol que puede bypassear RLS** — verificar al diseñar la migración que las políticas no bloqueen los `CREATE TABLE`/`INSERT` de esquema.
- **Tests e2e**: un buen caso de ataque es que un request con JWT de la Org A ni siquiera pueda *leer* un `id` válido de la Org B, aunque el filtro de aplicación se removiera — RLS es el último escudo.
- Si `app.current_org` no está seteado, `current_setting()` devuelve `NULL` y la política bloquea todo (fail-closed): es el comportamiento deseado, pero hay que asegurarse de setearlo en endpoints públicos o contextos de sistema (health checks, migraciones) donde corresponda.
