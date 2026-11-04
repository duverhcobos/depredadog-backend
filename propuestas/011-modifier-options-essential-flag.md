# Propuesta 011 — `is_essential` en `modifier_options`

## Contexto

Extensión de la regla de agotados (continúa la 010): el usuario acotó
que **hay ingredientes que si se agotan, agotan el perro** — "por decir
la salchicha o el pan". No son intercambiables por un extra: sin ellos
no hay producto que vender.

Esto es distinto de `is_replaceable=false` (propuesta 010): mozzarella
no reemplazable = sin ↔ pero el perro se sigue vendiendo sin queso;
salchicha esencial agotada = **el producto entero se apaga**.

Decisión: flag global `is_essential` en `modifier_options` — "el pan es
esencial" es verdad del ingrediente (está incluido en todo el menú).
Si un caso por producto aparece después, la junction `product_modifier_
options` puede pisarlo (misma doctrina que la 010).

Semántica derivada: producto agotado efectivo =
`!product.isAvailable` **O** alguna opción `included_by_default` con
`is_essential && !is_available`. La derivación la hace el consumidor
(la app ya recibe las opciones); el backend solo expone el flag — el
`is_available` del producto queda como lo dejó el dueño.

## Orden de trabajo

### 1. Migración

`src/infrastructure/database/migrations/<ts>-AddEssentialFlagToModifierOptions.ts`

```sql
-- up
ALTER TABLE "modifier_options"
  ADD COLUMN "is_essential" boolean NOT NULL DEFAULT false;

-- down
ALTER TABLE "modifier_options" DROP COLUMN "is_essential";
```

Default `false` — ninguna opción tumba productos hasta que el dueño
la marque esencial.

### 2. Entidad

`src/modules/catalog/domain/entities/modifier-option.entity.ts` —
después de `isReplacementEligible`, mismo estilo de doc:

```ts
  /**
   * Regla de negocio (decisión del usuario): ingrediente ESENCIAL —
   * si se agota estando incluido, el producto entero queda agotado
   * (salchicha, pan: sin ellos no hay perro que vender). El flag
   * solo deriva agotado en opciones incluidas; como extra agotado
   * solo desaparece/deshabilita.
   */
  isEssential = false;
```

### 3. Schema

`src/infrastructure/database/schemas/modifier-option.schema.ts`:

```ts
    isEssential: { name: 'is_essential', type: 'boolean', default: false },
```

### 4. Contrato (DTO + mapper + doc API)

`catalog-response.dto.ts` (`ModifierOptionResponseDto`) +
`catalog.mapper.ts`: agregar `isEssential: boolean` al final del
option.

`documentacion/api/catalog/001-get-catalog.md`: fila en la tabla de
campos + JSON de ejemplo — `isEssential` explica que la app deriva el
agotado del producto cuando una opción incluida esencial se apaga.

### 5. Seed

`src/infrastructure/database/seeds/catalog.seed.ts` — complementar el
UPDATE del "corazón del perro" agregando `is_essential = true`:

```ts
// Corazón del perro: ni se cambia, ni se regala, y si se agota
// tumba el producto (regla del usuario).
await manager.query(
  `UPDATE "modifier_options"
      SET "is_replaceable" = false,
          "is_replacement_eligible" = false,
          "is_essential" = true
    WHERE "name" IN ('Salchicha americana', 'Pan')`,
);
```

### 6. Specs

- `catalog.mapper.spec.ts`: el option mapea `isEssential`.
- `catalog.repository.spec.ts`: el flag viaja del registro al option.
- `test/catalog/get-catalog.e2e-spec.ts`: fixture con una opción
  `isEssential:true` + aserción de que viaja el `true` (el default
  `false` ya queda cubierto por las demás aserciones del árbol).

### 7. Modelo documentado

`documentacion/modelo-de-datos.md`: fila `is_essential` en
`modifier_options` + extender la nota de "Decisiones tomadas" — la
regla del cambio gratis ahora tiene 3 flags (`is_replaceable`,
`is_replacement_eligible`, `is_essential`) y explicar la derivación:
producto agotado efectivo = `!is_available` o ingrediente incluido
esencial agotado.

## Fuera de alcance

- La app deriva `isAvailable` efectivo en su cambio (cards "Agotado",
  detalle con CTA deshabilitado) — el backend no reescribe el flag del
  dueño.
- `orders` validará la misma regla server-side al crear la orden
  (módulo futuro).
- UI de admin para tocar el flag (pendientes/007).

## Verificación

1. `npm run migration:run` dev + `DB_DATABASE=pcalientes_db_test` test;
   `migration:revert` en test revierte limpio; re-aplicar.
2. `npm run seed:catalog` — salchicha/pan quedan `false,false,true`.
3. `npm run build`, `npm run test`, `npm run test:e2e` — verde.
4. `npx eslint` en los archivos tocados — cero errores prettier.
5. Smoke: `GET /catalog` muestra `isEssential` por opción.
