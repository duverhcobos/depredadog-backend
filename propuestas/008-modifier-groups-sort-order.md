# Propuesta 008 — `sort_order` global en `modifier_groups`

## Contexto

El `revisor` detectó (hallazgo MENOR) que el orden de `product.modifierGroups`
en `GET /catalog` no está garantizado por el código: hoy queda determinista
solo por el orden físico de inserción del seed en `product_modifier_groups`
(la query de links no tiene `ORDER BY` y el orden del `groups.find` se pierde
al re-ensamblar por producto).

**Decisión del usuario**: columna `sort_order` **global** en `modifier_groups`
(mismo orden de grupos para todo el menú: Ingredientes → Toppings → Salsas).
Consistente con `modifier_options.sort_order` (también global por grupo). Si
algún día hace falta orden por producto, se evoluciona a la junction — YAGNI
hoy.

## Alcance

Solo la columna + su consumo en el orden de `modifierGroups`. El contrato del
endpoint NO cambia (el response ya no expone `sortOrder` en grupos — solo
garantiza el orden del array).

## Orden de trabajo

### 1. Migración

`src/infrastructure/database/migrations/<timestamp>-AddSortOrderToModifierGroups.ts`
(crear con `npx typeorm-ts-node-commonjs migration:create` — el script
`migration:create` de package.json tiene un bug preexistente con `-d`; NO
arreglarlo aquí).

Estilo: seguir el de `1793803996122-CreateCatalogTables.ts` (queryRunner.query
con comillas dobles en identificadores).

```sql
-- up
ALTER TABLE "modifier_groups" ADD COLUMN "sort_order" integer NOT NULL DEFAULT 0

-- down
ALTER TABLE "modifier_groups" DROP COLUMN "sort_order"
```

### 2. Entidad de dominio

`src/modules/catalog/domain/entities/modifier-group.entity.ts` — agregar
después de `maxSelect`:

```ts
  /** Orden de despliegue del grupo en el menú (global). */
  sortOrder = 0;
```

### 3. Schema TypeORM

`src/infrastructure/database/schemas/modifier-group.schema.ts` — agregar
después de `maxSelect`:

```ts
    sortOrder: { name: 'sort_order', type: 'int', default: 0 },
```

### 4. Repositorio

`src/modules/catalog/infrastructure/repositories/catalog.repository.ts`:

a) Cambiar el `order` del `groups.find` de `{ slug: 'ASC' }` a
`{ sortOrder: 'ASC' }` (el orden del array `groups` ahora es el orden de
despliegue real).

b) Garantizar el orden en el ensamblado por producto: después del `.map` que
construye `clone` con sus `options`, encadenar:

```ts
        .sort((a, b) => a.sortOrder - b.sortOrder);
```

(el `clone` ya trae `sortOrder` copiado por `Object.assign`). Resultado:

```ts
      p.modifierGroups = (linksByProduct.get(p.id) ?? [])
        .map((gid) => groupById.get(gid))
        .filter((g): g is ModifierGroup => g !== undefined)
        .map((g) => {
          const clone = Object.assign(new ModifierGroup(), g);
          clone.options = (optionsByGroup.get(g.id) ?? [])
            .map(...)
            .sort(...);        // ya existe — no tocar
          return clone;
        })
        .sort((a, b) => a.sortOrder - b.sortOrder);
```

### 5. Seed

`src/infrastructure/database/seeds/catalog.seed.ts`:

a) En el tipo del array `groups` (donde esté su shape — línea ~30 del archivo)
agregar `sortOrder: number`. Si los entries son un literal inline, agregar el
campo a cada uno directamente.

b) En el array `groups` (líneas ~55-57):

```ts
  { id: u(11), slug: 'ingredients', name: 'Ingredientes', sortOrder: 0 },
  { id: u(12), slug: 'toppings', name: 'Toppings', sortOrder: 1 },
  { id: u(13), slug: 'sauces', name: 'Salsas', sortOrder: 2 },
```

c) En el INSERT de `modifier_groups` (líneas ~178-182) agregar la columna:

```ts
      await manager.query(`
        INSERT INTO "modifier_groups" ("id", "slug", "name", "sort_order")
        VALUES ${groups.map((g) => `(${q(g.id)}, ${q(g.slug)}, ${q(g.name)}, ${g.sortOrder})`).join(', ')}
        ON CONFLICT DO NOTHING
      `);
```

### 6. Modelo documentado

`documentacion/modelo-de-datos.md` — en la definición de `modifier_groups`
agregar la fila `sort_order` (int, NOT NULL, default 0 — "orden de despliegue
del grupo en el menú"). Actualizar el fragmento de la sección para que quede
consistente.

### 7. Spec del repositorio

`src/modules/catalog/infrastructure/repositories/catalog.repository.spec.ts` —
agregar un caso que pruebe que los grupos llegan ordenados por `sortOrder`
aunque los links vengan en orden inverso:

```ts
  it('ordena modifierGroups por sort_order del grupo, no por orden de links', async () => {
    categories.find.mockResolvedValue([category('c1')]);
    products.find.mockResolvedValue([product('p1', 'c1')]);
    images.find.mockResolvedValue([]);

    // Links llegan invertidos (sin ORDER BY en la junction).
    const link1 = new ProductModifierGroup();
    link1.productId = 'p1';
    link1.groupId = 'g-sauces';
    const link2 = new ProductModifierGroup();
    link2.productId = 'p1';
    link2.groupId = 'g-ingredients';
    productGroups.find.mockResolvedValue([link1, link2]);
    productOptions.find.mockResolvedValue([]);

    const sauces = new ModifierGroup();
    sauces.id = 'g-sauces';
    sauces.slug = 'sauces';
    sauces.sortOrder = 2;
    const ingredients = new ModifierGroup();
    ingredients.id = 'g-ingredients';
    ingredients.slug = 'ingredients';
    ingredients.sortOrder = 0;
    groups.find.mockResolvedValue([sauces, ingredients]);
    options.find.mockResolvedValue([]);

    const result = await repo.getMenu();
    const slugs = result[0].products[0].modifierGroups.map((g) => g.slug);
    expect(slugs).toEqual(['ingredients', 'sauces']);
  });
```

(Ajustar a los helpers del spec existente si difieren en nombre.)

## Fuera de alcance

- Response del endpoint: no agregar `sortOrder` al DTO de grupos (es metadata
  de orden, no dato útil del contrato — el orden del array ES la señal).
- `product_modifier_groups.sort_order`: evolución posible pero descartada por
  ahora (decisión del usuario).
- e2e: el fixture usa un solo grupo — no requiere cambio (sigue pasando).

## Verificación

1. `npm run migration:run` en dev (`pcalientes_db`) y test
   (`DB_DATABASE=pcalientes_db_test`) — aplica limpio.
2. `npm run migration:revert` en test → revierte; re-aplicar con `run`.
3. `npm run build`, `npm run test`, `npm run test:e2e` — todo verde.
4. `npm run seed:catalog` — re-corre idempotente (los `ON CONFLICT DO NOTHING`
   ya cubren la columna nueva).
5. Smoke opcional: `GET /catalog` devuelve grupos en orden
   ingredients → toppings → sauces por producto.
