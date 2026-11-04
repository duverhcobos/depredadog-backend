# Propuesta 010 — flags de reemplazo gratis en `modifier_options`

## Contexto

Regla del "cambio gratis" (app §019): si un ingrediente incluido se
agota, el cliente puede cambiarlo por UN adicional sin costo. En la
revisión visual el usuario acotó la regla en **dos direcciones**:

1. **No todo ingrediente agotado admite cambio** — "la salchicha no se
   puede cambiar": si el corazón del producto se agota, el dueño marca
   el producto agotado; no hay ↔ para regalar otro ingrediente.
2. **No todo adicional puede regalarse como reemplazo** — la salchicha
   (doble +$5.000) no debe salir en la lista de opciones gratis.

Decisión del usuario: **los dos flags**, por ingrediente — propiedad
global de la opción, igual que `is_removable`/`is_available` ("hay
ingredientes que no se pueden cambiar… o sea, no se listan").

¿Por qué global y no por producto (junction)? La tabla
`product_modifier_options` es *sparse* (solo existen filas de opciones
incluidas) — los candidatos del picker son extras **sin fila** en la
junction, así que su elegibilidad no puede vivir ahí. Y semánticamente
"la salchicha no se regala" es verdad del ingrediente, no del producto.
Si un caso por producto aparece después, la junction puede pisarlo.

## Orden de trabajo

### 1. Migración

`src/infrastructure/database/migrations/<ts>-AddReplacementFlagsToModifierOptions.ts`

```sql
-- up
ALTER TABLE "modifier_options"
  ADD COLUMN "is_replaceable" boolean NOT NULL DEFAULT true,
  ADD COLUMN "is_replacement_eligible" boolean NOT NULL DEFAULT true;

-- down
ALTER TABLE "modifier_options"
  DROP COLUMN "is_replacement_eligible",
  DROP COLUMN "is_replaceable";
```

Default `true` = comportamiento actual (todo cambiable/regalable) hasta
que el dueño marque lo contrario.

### 2. Entidad

`src/modules/catalog/domain/entities/modifier-option.entity.ts` —
después de `isAvailable`, con el mismo estilo de doc de
`includedByDefault`:

```ts
  /**
   * Regla de negocio (decisión del usuario): si la opción incluida se
   * agota, ¿el cliente puede cambiarla por un adicional gratis?
   * false en el corazón del producto (salchicha, pan) — el dueño
   * marca el producto agotado en vez de regalar un sustituto.
   */
  isReplaceable = true;
  /**
   * ¿La opción puede ofrecerse como reemplazo gratis? false en lo que
   * no se regala (salchicha — doble cobrado); los toppings/salsas
   * baratas sí (default true).
   */
  isReplacementEligible = true;
```

### 3. Schema

`src/infrastructure/database/schemas/modifier-option.schema.ts`:

```ts
    isReplaceable: { name: 'is_replaceable', type: 'boolean', default: true },
    isReplacementEligible: {
      name: 'is_replacement_eligible',
      type: 'boolean',
      default: true,
    },
```

### 4. Contrato (DTO + mapper + doc API)

`catalog-response.dto.ts` (`ModifierOptionResponseDto`) +
`catalog.mapper.ts`: agregar `isReplaceable: boolean` y
`isReplacementEligible: boolean` al final del option.

`documentacion/api/catalog/001-get-catalog.md`: dos filas en la tabla de
campos de la opción + JSON de ejemplo.

### 5. Seed

`src/infrastructure/database/seeds/catalog.seed.ts` — después de los
INSERTs existentes, UPDATEs idempotentes que marcan la regla:

```ts
// Corazón del perro: ni se cambia ni se regala (regla del usuario).
await manager.query(
  `UPDATE "modifier_options"
      SET "is_replaceable" = false,
          "is_replacement_eligible" = false
    WHERE "name" IN ('Salchicha americana', 'Pan artesanal')`,
);
```

(Toppings, salsas y el resto de extras quedan con los defaults `true` —
el dueño los puede regalar; al llegar el admin los ajusta.)

### 6. Specs

- `catalog.mapper.spec.ts`: el option mapea ambos flags.
- `catalog.repository.spec.ts`: el option armado lleva los flags del
  registro.
- `test/catalog/get-catalog.e2e-spec.ts`: aserción de los dos campos
  presentes con valores del fixture (una opción con
  `isReplacementEligible:false` para verificar que viaja el false, no
  solo el default).

### 7. Modelo documentado

`documentacion/modelo-de-datos.md`: dos filas en la tabla
`modifier_options` + nota en "Decisiones tomadas" explicando la regla
del cambio gratis y por qué son globales (referencia a la sparse
junction).

## Fuera de alcance

- La app consume los flags en su propio cambio (filtrar picker por
  `isReplacementEligible`, mostrar ↔ solo si `isReplaceable`).
- UI de admin para tocar los flags (pendientes/007).
- Flag por producto (override en junction) si aparece el caso.

## Verificación

1. `npm run migration:run` dev + `DB_DATABASE=pcalientes_db_test` test;
   `migration:revert` en test revierte limpio; re-aplicar.
2. `npm run seed:catalog` — idempotente; salchicha/pan quedan con
   `false,false`.
3. `npm run build`, `npm run test`, `npm run test:e2e` — verde.
4. `npx eslint` en los archivos tocados — cero errores prettier.
5. Smoke: `GET /catalog` muestra ambos flags por opción.
