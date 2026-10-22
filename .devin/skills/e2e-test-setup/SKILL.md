---
name: e2e-test-setup
description: Setup requerido para correr npm run test:e2e en el backend — base de datos de test separada, migraciones, y cómo neutralizar el rate-limit en los specs
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

# Setup de `npm run test:e2e`

`NODE_ENV=test` (Jest lo setea automáticamente) hace que `app.module.ts` cargue **`.env.test`** en vez de `.env` — base de datos y throttle separados, para que los e2e nunca toquen la BD de desarrollo. Configurar `envFilePath` condicional por `NODE_ENV` en `app.module.ts` al montar el setup e2e — sin eso, los specs corren contra la BD de dev en silencio.

## Setup manual (una sola vez por máquina)

1. **Crear la base de datos de test** — no se crea sola:
   ```sql
   CREATE DATABASE <app>_test;
   ```
   Mismas credenciales que `.env.test` (`DB_HOST`/`DB_USERNAME`/`DB_PASSWORD`, normalmente el mismo Postgres local que `.env`, solo cambia `DB_DATABASE`).

2. **Correr las migraciones contra esa base.** `MIGRATIONS_RUN=true` en `.env.test` solo corre migraciones cuando **arranca la app** (vía Nest) — el script CLI `npm run migration:run` usa `typeorm.config.ts`, que carga `.env` con `dotenv.config()`, **no** `.env.test`. Hay que sobreescribir las env vars de conexión para ese comando puntual (PowerShell):
   ```powershell
   $env:DB_DATABASE='<app>_test'; npm run migration:run
   ```
   (repetir con `DB_HOST`/`DB_USERNAME`/`DB_PASSWORD` si difieren de `.env`).

Repetir el paso 2 cada vez que se agregue una migración nueva (`migration:generate`) — la BD de test necesita quedar al día igual que la de dev.

3. **Rol de aplicación** (si el proyecto usa RLS): `.env.test` define `DB_APP_USERNAME`/`DB_APP_PASSWORD` — la app corre en los e2e como un rol sin privilegios (ej. `app_role`), así RLS enforca de verdad. Crear el rol una vez por BD de test (script `scripts/create-app-db-role.mjs` cuando exista). La limpieza de tablas con RLS la hace el bootstrap de test con credenciales owner — el rol de aplicación no puede borrar sin el GUC de tenant (fail-closed) y el bypass lo da ser **superuser**, no owner (`FORCE` sí filtra al owner).

## Rate limiting (`@Throttle`) en los specs de auth

Los controllers sensibles suelen tener límites de `@Throttle()` por ruta (ej. 3–5/min en auth) para mitigar fuerza bruta en producción. **Son independientes del `THROTTLE_LIMIT` global** — poner un valor permisivo en `.env.test` no los afecta, y un e2e que dispara más requests que el límite de la ruta en el mismo minuto recibe `429` sin que tenga que ver con lo que el test intenta validar.

`ThrottlerGuard` se registra como `APP_GUARD` global, y `TestingModule#overrideGuard`/`#overrideProvider` de Nest **no reemplazan de forma confiable** guards globales repartidos entre módulos — el mock puede nunca invocarse. El patrón que sí funciona: mockear el método del prototipo directamente, antes de compilar el `TestingModule` (centralizarlo en `test/support/e2e-app.ts`):

```ts
throttlerGuardSpy = jest
  .spyOn(ThrottlerGuard.prototype, 'canActivate')
  .mockResolvedValue(true);
```

Restaurar en `afterAll` con `throttlerGuardSpy.mockRestore()`.

## Organización de specs: un archivo por endpoint

Los e2e NO se acumulan en un solo archivo. Cada endpoint tiene su propio spec:

```
test/
├── support/e2e-app.ts          ← bootstrap + helpers compartidos (única fuente)
├── auth/
│   ├── login.e2e-spec.ts       ← POST /auth/login
│   ├── register.e2e-spec.ts
│   └── ...
├── users/
│   ├── list.e2e-spec.ts        ← GET /users
│   ├── status.e2e-spec.ts      ← PATCH /users/:id/status
│   └── ...
└── me/
    └── org-invites-accept.e2e-spec.ts
```

- **Carpeta = módulo** (`auth/`, `users/`, `me/`); **archivo = slug del endpoint** sin el método (`list`, `status`, `org-invites-accept`). Cuando dos métodos distintos caen sobre la misma ruta (`GET` vs `POST /users`), el slug los desambigua (`list` vs `create`).
- **`test/support/e2e-app.ts`** es la única fuente del bootstrap (TestingModule + mocks de servicios externos/Throttle + limpieza de BD) y de los helpers compartidos (`registerUser`, `loginAndGetToken`...). Un spec nuevo solo importa el contexto — nunca duplica setup.
- **Regla de casa para tests multi-endpoint**: el test vive en el archivo del endpoint que valida su assertion principal; los llamados a otros endpoints dentro del test son setup del escenario, no cambian dónde vive.
- `jest-e2e.json` fija `maxWorkers: 1`: los specs comparten la misma BD de test y el `beforeEach` de limpieza no tolera workers paralelos.

## Al escribir un e2e-spec nuevo

- Crear `test/<modulo>/<slug-endpoint>.e2e-spec.ts` — no agregar describes a specs de otros endpoints.
- Si el endpoint tiene `@Throttle()` propio y el spec dispara varios requests seguidos (casos de validación, duplicados, etc.), el mock de `ThrottlerGuard.prototype.canActivate` ya viene en el bootstrap de `support/e2e-app.ts` — no hace falta repetirlo, pero tener presente que por eso el throttle no estorba.
- Los mensajes de error esperados en los `expect()` deben coincidir con las excepciones de dominio reales (que responden en **inglés** de forma consistente en todo el proyecto — ver `domain/exceptions/`), no traducirlos al español por conveniencia.
