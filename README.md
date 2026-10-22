# template_nestj

Template de arranque para backend **NestJS + TypeORM + PostgreSQL** con convenciones DDD, workflow de propuestas y subagentes de desarrollo.

## Qué incluye

- Scaffold `nest new` (NestJS 11, modo `--strict`) + dependencias base: `@nestjs/config`, `@nestjs/typeorm`, `typeorm`, `pg`, `class-validator`, `class-transformer`, `@nestjs/swagger`, `@nestjs/throttler`.
- `.devin/skills/` — 20 skills de convenciones de desarrollo (DDD, capas estrictas, migraciones, IDOR, RLS multi-tenant, paginación, tests, propuestas).
- `.devin/agents/` — subagentes `implementador` y `revisor`.
- `AGENTS.md` — reglas vigentes e índice de skills.
- Carpetas de workflow: `propuestas/`, `pendientes/`, `planeaciones/`, `documentacion/api/`.

## Cómo usarlo

1. Copiar la carpeta al nombre del producto nuevo.
2. `npm install` → `npm run start:dev`.
3. Actualizar `package.json` (`name`), `.env` (copiar de `.env.example`), y las skills que mencionen el nombre del proyecto.
4. Cuando nazca el dominio, crear el documento del modelo en `documentacion/` y la primera propuesta en `propuestas/001-*.md`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run start:dev` | Servidor con watch (`:3000`) |
| `npm run build` / `npx tsc --noEmit` | Compilar / typecheck |
| `npm run test` / `npm run test:e2e` | Unitarios Jest / e2e (ver skill `e2e-test-setup`) |
| `npm run lint` | ESLint |
