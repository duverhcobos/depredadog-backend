# pcalientes_backend

Backend de **Depredadog** — **NestJS + TypeORM + PostgreSQL** con convenciones DDD, workflow de propuestas y subagentes de desarrollo.

## Qué incluye

- Scaffold `nest new` (NestJS 11, modo `--strict`) + dependencias base: `@nestjs/config`, `@nestjs/typeorm`, `typeorm`, `pg`, `class-validator`, `class-transformer`, `@nestjs/swagger`, `@nestjs/throttler`.
- `.devin/skills/` — 20 skills de convenciones de desarrollo (DDD, capas estrictas, migraciones, IDOR, RLS multi-tenant, paginación, tests, propuestas).
- `.devin/agents/` — subagentes `implementador` y `revisor`.
- `AGENTS.md` — reglas vigentes e índice de skills.
- Carpetas de workflow: `propuestas/`, `pendientes/`, `planeaciones/`, `documentacion/api/`.

## Setup

1. `npm install`.
2. Copiar `.env.example` → `.env` y completar credenciales de Postgres.
3. `npm run start:dev`.
4. Cuando nazca el dominio, crear el documento del modelo en `documentacion/` y la primera propuesta en `propuestas/001-*.md`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run start:dev` | Servidor con watch (`:3000`) |
| `npm run build` / `npx tsc --noEmit` | Compilar / typecheck |
| `npm run test` / `npm run test:e2e` | Unitarios Jest / e2e (ver skill `e2e-test-setup`) |
| `npm run lint` | ESLint |

## App hermana

`../depredadog_app` — app móvil Flutter (Clean Architecture + BLoC), único cliente esperado de este backend. Comparte el workflow de skills/propuestas y las carpetas `pendientes/` y `planeaciones/` viven acá.
