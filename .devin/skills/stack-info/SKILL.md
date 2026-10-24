---
name: stack-info
description: Stack tecnológico del backend NestJS de Depredadog (framework, DB, package manager, auth, OS)
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Referencia del stack tecnológico del backend **NestJS** de Depredadog, confirmada contra `package.json` y el código real. Usar esta información como base antes de sugerir librerías, comandos o patrones — nunca asumir un stack distinto al descrito acá.

- **Framework**: NestJS 11, modo `--strict`. Bootstrap completo (propuesta 001): ConfigModule con `env.validation`, ValidationPipe global (`whitelist` + `forbidNonWhitelisted`), filtros globales de excepciones (strategy pattern), logger Winston a `logs/`, throttler global con `/health` exenta, `enableShutdownHooks`, Swagger en no-prod.
- **Base de datos**: PostgreSQL + TypeORM 0.3 (`@nestjs/typeorm`, `typeorm`, `pg`). `synchronize` **hardcodeado `false`** (`database.config.ts`/`database.module.ts`) — el esquema cambia SOLO por migraciones (`MIGRATIONS_RUN` las corre al arrancar en dev/test). La variable `DB_SYNCHRONIZE` existe en los `.env` como guard rail documentada pero **no se lee** — no reintroducirla como flag real.
- **Package manager**: npm — **nunca** pnpm ni yarn (solo existe `package-lock.json`).
- **Validación**: `class-validator` + `class-transformer` (pipe global activo). `env.validation.ts` valida las env vars al arrancar.
- **Docs**: `@nestjs/swagger` 11 — `SwaggerModule` en `main.ts` (title "Depredadog API", bearer auth) solo fuera de prod + decoradores `@Api*` en DTOs.
- **Rate limiting**: `@nestjs/throttler` global (100/min default; auth tiene límites estrictos por ruta) — ver `code-patterns`.
- **Autenticación**: **implementada** (módulo `auth`, propuestas 002+003) — JWT access 15min + refresh 30días con rotación (`@nestjs/jwt`/`@nestjs/passport` majors **11** — los 12 son ESM-only y rompen Jest), bcrypt, verificación por código de 6 dígitos, forgot/reset password, Google Sign-In por `idToken` (`google-auth-library`), email real vía Resend (`fetch` nativo, fallback a log sin `RESEND_API_KEY`). Single-tenant (sin contexto de tenant en el payload).
- **Tests**: Jest (unitarios `*.spec.ts` junto al código — 93 tests) + e2e Supertest en `test/` (47 tests, BD `pcalientes_db_test` separada) — ver skills `unit-test-checklist` y `e2e-test-setup`.
- **OS de desarrollo**: Windows / PowerShell — los comandos de ejemplo y scripts deben ser compatibles con PowerShell, no asumir sintaxis de bash.

> Estado actual del repo: bootstrap + módulo `auth` completos (10 endpoints, 5 tablas migradas). Cliente: la app Flutter `../depredadog_app` (carpeta pendiente de renombrar desde `pcalientes_app`).
