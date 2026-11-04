# Propuesta 009 — `slug` en `products`

## Contexto

La app necesita una **clave de máquina estable por producto**: mapear el
asset local mientras `imageUrl` es `null` (`product.slug` →
`assets/images/products/<x>.png`) y como segmento de ruta del detalle
(`/home/category/perros/product/<slug>`).

Decisión del usuario (encuesta de la integración §019 de la app): columna
`slug` — mismo patrón ya aplicado a `categories.slug` y
`modifier_groups.slug` (clave inmutable, separada del nombre editable).

## Orden de trabajo

### 1. Migración

`src/infrastructure/database/migrations/<ts>-AddSlugToProducts.ts`
(crear con `npx typeorm-ts-node-commonjs migration:create` — el script
npm tiene el bug `-d` preexistente).

```sql
-- up
ALTER TABLE "products" ADD COLUMN "slug" varchar(120) NOT NULL DEFAULT '';
-- Placeholder técnico único para filas ya sembradas (permite crear el
-- índice único; el seed pisa con el slug real). NO es dato de negocio.
UPDATE "products" SET "slug" = 'product-' || "id" WHERE "slug" = '';
CREATE UNIQUE INDEX "uq_products_slug" ON "products" ("slug");

-- down
DROP INDEX "uq_products_slug";
ALTER TABLE "products" DROP COLUMN "slug";
```

### 2. Entidad

`src/modules/catalog/domain/entities/product.entity.ts` — después de
`name` (o donde quede mejor junto a los campos de identidad):

```ts
  /** Clave estable para el consumidor: 'depredador', 'cachorro'… */
  slug!: string;
```

### 3. Schema

`src/infrastructure/database/schemas/product.schema.ts` — después de
`name`:

```ts
    slug: { type: 'varchar', length: 120 },
```

### 4. Seed

`src/infrastructure/database/seeds/catalog.seed.ts`:

a) `ProductSeed` gana `slug: string`.
b) Cada producto recibe su slug (sin artículo, kebab-case):

| Producto | slug |
|---|---|
| El Depredador | `depredador` |
| El Cachorro | `cachorro` |
| La Trampa | `trampa` |
| Ave de Presa | `ave-presa` |
| El Coyote | `coyote` |
| El Carnicero | `carnicero` |
| Manada de Papas | `manada-papas` |

c) El INSERT de `products` incluye `"slug"` + `${q(p.slug)}`.
d) Después del INSERT, UPDATE idempotente para filas sembradas antes de
la columna (las del dev tienen el placeholder `product-<uuid>`):

```ts
      for (const p of products) {
        await manager.query(
          `UPDATE "products" SET "slug" = ${q(p.slug)} WHERE "id" = ${q(p.id)} AND "slug" <> ${q(p.slug)}`,
        );
      }
```

### 5. Contrato (DTO + doc)

`src/modules/catalog/application/dtos/catalog-response.dto.ts` +
`catalog.mapper.ts`: el producto del response gana `slug: string`
(campo obligatorio, después de `name`).

`documentacion/api/catalog/001-get-catalog.md`: agregar `slug` a la tabla
de campos del producto y al JSON de ejemplo.

### 6. e2e

`test/catalog/get-catalog.e2e-spec.ts`: el fixture `seedMenu` guarda el
producto con `slug: 'el-cachorro'` (o similar) y el spec del árbol aserta
`expect(product.slug).toBe('el-cachorro')`. Los demás `save` de Product
en el spec también necesitan slug (columna NOT NULL).

### 7. Modelo documentado

`documentacion/modelo-de-datos.md`: fila `slug` en la tabla `products`
(varchar 120, UNIQUE — "clave estable para consumidores: assets, rutas").

## Fuera de alcance

- Slug editable por el dueño (admin no existe aún — pendientes/007).
- Slugify automático desde `name` (los slugs se definen en el seed/admin,
  nunca derivados del nombre — ese es el punto del contrato).

## Verificación

1. `npm run migration:run` dev + `DB_DATABASE=pcalientes_db_test` test;
   `migration:revert` en test revierte limpio; re-aplicar.
2. `npm run seed:catalog` — idempotente; en dev los 7 productos quedan
   con su slug real.
3. `npm run build`, `npm run test`, `npm run test:e2e` — verde.
4. `npx eslint` en los archivos tocados — cero errores prettier.
5. Smoke opcional: `GET /catalog` muestra `slug` por producto.
