---
name: stack-info
description: Stack tecnológico del backend NestJS de PCalientes (framework, DB, package manager, auth, OS)
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Referencia del stack tecnológico del backend **NestJS** de PCalientes (scaffold `nest new` + dependencias base ya instaladas), confirmada contra `package.json`. Usar esta información como base antes de sugerir librerías, comandos o patrones — nunca asumir un stack distinto al descrito acá.

- **Framework**: NestJS 11 (`nest new`, modo `--strict`). La app arranca mínima (`src/app.module.ts`, `src/main.ts`); la estructura DDD por módulos (`src/modules/<modulo>/`, `src/common/`, `src/infrastructure/`) se crea siguiendo la skill `module-structure` a medida que aparecen los primeros endpoints.
- **Base de datos**: PostgreSQL + TypeORM 0.3 (`@nestjs/typeorm`, `typeorm`, `pg` instalados). `synchronize` debe quedar atado a desarrollo; en producción `false` y las migraciones son obligatorias — ver skill `migrations-workflow`.
- **Package manager**: npm — **nunca** pnpm ni yarn (solo existe `package-lock.json`). Todo comando de instalación/scripts debe usar `npm`.
- **Validación**: `class-validator` + `class-transformer` (pipe global en `main.ts` cuando se agreguen endpoints — ver skill `new-endpoint-checklist`).
- **Docs**: `@nestjs/swagger` 11 para `SwaggerModule` en `main.ts` + decoradores `@Api*` en DTOs.
- **Rate limiting**: `@nestjs/throttler` — ver el patrón en skill `code-patterns`.
- **Autenticación**: no implementada todavía. Cuando se agregue, la convención del proyecto es JWT + bcrypt con `jsonwebtoken`/`@nestjs/jwt` + Passport — diseñarlo en su propuesta (ver `code-patterns` para el patrón de JWT payload con contexto de tenant si el producto es multi-tenant).
- **Tests**: Jest (unitarios en `*.spec.ts` junto al código) + e2e en `test/` — ver skills `unit-test-checklist` y `e2e-test-setup`.
- **OS de desarrollo**: Windows / PowerShell — los comandos de ejemplo y scripts deben ser compatibles con PowerShell, no asumir sintaxis de bash.

> Estado actual del repo: el scaffold es mínimo — las skills describen las convenciones a seguir cuando el proyecto crezca, no necesariamente lo que ya existe en `src/`.
