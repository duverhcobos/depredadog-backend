---
name: migrations-workflow
description: Workflow obligatorio de migraciones TypeORM de este backend — cuándo generar vs. escribir a mano, naming, corrida en dev+test, verificación de revert, seeds y RLS
---

Workflow de migraciones del backend (`template_nestj`). Aplicar **siempre** que una propuesta cree/altere tablas — la base de datos cambia SOLO vía migraciones, nunca con `synchronize`.

## Regla madre

`DB_SYNCHRONIZE=false` en todos los entornos, siempre. El esquema vive en
`src/infrastructure/database/migrations/` y se aplica con
`npm run migration:run`. `synchronize=true` junto con migraciones compite
por el esquema y produce drift inconsistente (ver `.env.example`).

## Comandos (Windows/PowerShell, `typeorm-ts-node-commonjs` + `typeorm.config.ts`)

```powershell
npm run migration:create    # archivo vacío con timestamp, para escribir a mano
npm run migration:generate  # diffs entities ↔ BD (limitado, ver abajo)
npm run migration:run       # aplica pendientes en la BD configurada
npm run migration:revert    # revierte la ÚLTIMA aplicada
npm run migration:show      # lista aplicadas/pendientes
```

La BD destino la define `typeorm.config.ts` leyendo el `.env` activo — para
la BD de test usar las vars de `.env.test` (ver `e2e-test-setup`).

## Cuándo escribir a mano vs. `migration:generate`

**Escribir a mano (`migration:create`) es el default recomendado** — la
experiencia previa mostró que `generate` no maneja bien enums de Postgres
(`CREATE TYPE`), seeds ni constraints avanzados. Usar `generate` solo como
borrador para diffear entidades simples, y siempre revisar el SQL generado
antes de aplicar.

Escribir a mano además permite:
- `CREATE TYPE ... AS ENUM` + columnas `type: 'enum', enumName: '...'`.
- `INSERT` de seeds en la misma migración (ej. `roles`: `ADMIN`/`OPERATOR`/`COLLECTOR`/`PRODUCER`).
- `CREATE INDEX` compuestos `(organization_id, ...)` — ver `listados-paginacion-indices`.
- Políticas RLS (`ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`) — ver `rls-tenant-isolation`.

## Naming y formato

- Archivo: `<timestamp>-<NombrePascal>.ts` dentro de
  `src/infrastructure/database/migrations/` — el timestamp lo agrega
  `migration:create`/`generate` solo, no inventarlo a mano.
- `down()` es **obligatorio** y debe revertir en orden inverso exacto:
  primero `DROP` de tablas hijas (FKs), luego padres, y `DROP TYPE` de los
  enums al final.
- Todo nombre de tabla/columna del esquema va en **inglés** y las
  **tablas nuevas en plural** (`users`, `orders`, `order_items`) — evita
  choques con palabras reservadas de Postgres (`"user"` necesita
  comillas) y sigue la convención dominante.
  - Las join tables usan `<singular>_<singular>` con prefijo de la
    entidad padre (ej. `user_profiles`); tablas de relación con columnas
    propias van en plural directo (`memberships`).
  - Columnas en `snake_case` inglés (`created_at`, `organization_id`);
    enums en `snake_case` (`user_status`, `organization_status`).

## Checklist antes de dar por aplicada una migración

1. `npm run migration:run` en la BD de dev.
2. `npm run migration:run` **también** en la BD de test
   (`<app>_test`) — los e2e dependen de que ambas estén al día.
3. `npm run migration:revert` en test para verificar que `down()` revierte
   limpio, y re-aplicar con `run`.
4. `npx tsc --noEmit` + `npm run test` + `npm run test:e2e` en verde.
5. Schemas TypeORM (`src/infrastructure/database/schemas/`) alineados con
   la migración — el schema entity debe matchear nombre de tabla/columnas.

## Nunca

- Editar una migración ya aplicada — crear una nueva de corrección.
- `migration:revert` en producción sin plan explícito (revierte lo último,
  puede tirar datos).
- Datos de negocio en seeds dentro de migraciones de esquema — solo
  catálogos fijos (`role`, futuros `permiso`, `plan`).
