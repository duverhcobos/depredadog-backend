# Propuesta: Fidelidad de personalización en el response de orders

El detalle del pedido en la app (§023 aprobado) muestra la personalización **idéntica al carrito**: "Lleva:" (incluidos efectivos), secciones por grupo (Ingredientes / Adicionales / Toppings / Salsas) y reemplazos gratis emparejados "X por Y". Hoy el response de `GET /orders/:id` no puede reproducirlo: no viaja `product_slug` (la card muestra la foto por slug), ni los nombres incluidos, ni el grupo del modificador, ni el `replaces_option_id` que empareja el par del cambio gratis.

**Regla de diseño**: el backend se adapta al diseño aprobado — snapshots de creación, igual que `product_name`/`unit_price`/`option_name`/`price_delta` ya lo son.

**Desviación del modelo — aprobación requerida** (skill modelo-evolucion):

- **Qué falta**: `order_items` no guarda `product_slug` ni los nombres incluidos efectivos; `order_item_modifiers` no guarda el grupo de origen ni el vínculo del reemplazo gratis.
- **Sugerencia**: `order_items.product_slug varchar(120) NULL` (mismo ancho que `products.slug` — corrección del review), `order_items.included_names text[] NOT NULL DEFAULT '{}'`; `order_item_modifiers.modifier_group varchar(50) NULL`, `order_item_modifiers.replaces_option_id uuid NULL REFERENCES modifier_options(id)` + `INDEX(replaces_option_id)`.
- **Por qué el modelo no lo cubre**: el §013 pensó en comanda/reportes ("qué entró a cocina"), no en reproducir la personalización visual del carrito — el snapshot ya era la herramienta, solo le faltaban estos datos.

Filas legacy quedan con `NULL`/`'{}'` (degradación honesta — el consumidor salta la sección que no puede pintar); `product_slug` se backfilla por join (barato, sin ambigüedad).

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/orders/domain/entities/order-item.entity.ts` | + `productSlug`, `includedNames` |
| `src/modules/orders/domain/entities/order-item-modifier.entity.ts` | + `modifierGroup`, `replacesOptionId` |
| `src/infrastructure/database/schemas/order-item.schema.ts` | + 2 columnas |
| `src/infrastructure/database/schemas/order-item-modifier.schema.ts` | + 2 columnas |
| `src/infrastructure/database/migrations/<ts>-AddOrderCustomizationSnapshots.ts` | **nueva** — ALTER de ambas tablas + backfill de `product_slug` |
| `src/modules/orders/application/use-cases/create-order.use-case.ts` | poblar los 4 snapshots al construir ítems |
| `src/modules/orders/application/dtos/order-response.dto.ts` | + 4 campos al response |
| `src/modules/orders/application/mappers/order.mapper.ts` | mapear los 4 campos |
| `documentacion/modelo-de-datos.md` | filas nuevas en ambas tablas + decisión |
| `documentacion/api/orders/00{1,2,3,4}-*.md` | campos nuevos en los ejemplos de response |
| `create-order.use-case.spec.ts` / `order.repository.spec.ts` / `orders.e2e-spec.ts` | asserts de los snapshots |

## Semántica de cada campo

| Columna | Contenido | Origen en `CreateOrderUseCase` |
|---|---|---|
| `order_items.product_slug` | `products.slug` al momento del pedido | `product.slug` |
| `order_items.included_names` | nombres de opciones `included_by_default` **menos las `removed`/`replaced`** — "lo que el ítem LLEVA" | `flattenOptions` + ids quitados |
| `order_item_modifiers.modifier_group` | `modifier_groups.slug` del grupo donde vive la opción (`ingredients`/`toppings`/`sauces`) | `g.slug` en el flatten |
| `order_item_modifiers.replaces_option_id` | solo en la fila `added` del cambio gratis: el `option_id` del incluido agotado que reemplaza | `m.replacesOptionId` del DTO |

## 1. `order-item.entity.ts` (existente — actualización)

**Ruta:** `src/modules/orders/domain/entities/order-item.entity.ts`

**Antes:**
```typescript
export class OrderItem {
  id!: string;
  orderId!: string;
  productId!: string;
  /** Snapshots — el producto puede renombrarse o cambiar de precio. */
  productName!: string;
  unitPrice!: number;
  quantity!: number;
  lineTotal!: number;
  notes: string | null = null;
  modifiers: OrderItemModifier[] = [];
}
```

**Después:**
```typescript
export class OrderItem {
  id!: string;
  orderId!: string;
  productId!: string;
  /** Snapshots — el producto puede renombrarse o cambiar de precio. */
  productName!: string;
  /** Snapshot del slug — la app mapea assets/foto por él (§016). */
  productSlug: string | null = null;
  unitPrice!: number;
  quantity!: number;
  lineTotal!: number;
  notes: string | null = null;
  /** "Lleva:" del detalle — incluidos por defecto MENOS quitados/
   *  reemplazados, snapshot al crear (§016). */
  includedNames: string[] = [];
  modifiers: OrderItemModifier[] = [];
}
```

## 2. `order-item-modifier.entity.ts` (existente — actualización)

**Ruta:** `src/modules/orders/domain/entities/order-item-modifier.entity.ts`

**Antes:**
```typescript
export class OrderItemModifier {
  id!: string;
  orderItemId!: string;
  /** NULL si la opción se borra del catálogo — el snapshot queda. */
  optionId: string | null = null;
  optionName!: string;
  action!: ModifierAction;
  priceDelta = 0;
}
```

**Después:**
```typescript
export class OrderItemModifier {
  id!: string;
  orderItemId!: string;
  /** NULL si la opción se borra del catálogo — el snapshot queda. */
  optionId: string | null = null;
  optionName!: string;
  action!: ModifierAction;
  priceDelta = 0;
  /** Snapshot del slug del grupo origen (§016) — la app secciona el
   *  detalle con él; null en filas previas a §016. */
  modifierGroup: string | null = null;
  /** Solo en la fila added del cambio gratis (§016): el incluido
   *  agotado que esta opción reemplaza — empareja el par removed→added. */
  replacesOptionId: string | null = null;
}
```

## 3. `order-item.schema.ts` (existente — actualización)

**Ruta:** `src/infrastructure/database/schemas/order-item.schema.ts`

**Antes:**
```typescript
    quantity: { type: 'int' },
    lineTotal: {
      name: 'line_total',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
    },
    notes: { type: 'text', nullable: true },
```

**Después:**
```typescript
    quantity: { type: 'int' },
    lineTotal: {
      name: 'line_total',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
    },
    notes: { type: 'text', nullable: true },
    productSlug: {
      name: 'product_slug',
      type: 'varchar',
      length: 120,
      nullable: true,
    },
    includedNames: {
      name: 'included_names',
      type: 'text',
      array: true,
      default: () => "'{}'",
    },
```

## 4. `order-item-modifier.schema.ts` (existente — actualización)

**Ruta:** `src/infrastructure/database/schemas/order-item-modifier.schema.ts`

**Antes:**
```typescript
    priceDelta: {
      name: 'price_delta',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
      default: 0,
    },
  },
});
```

**Después:**
```typescript
    priceDelta: {
      name: 'price_delta',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
      default: 0,
    },
    modifierGroup: {
      name: 'modifier_group',
      type: 'varchar',
      length: 50,
      nullable: true,
    },
    replacesOptionId: {
      name: 'replaces_option_id',
      type: 'uuid',
      nullable: true,
    },
  },
});
```

## 5. Migración (nueva — `npm run migration:create`, escrita a mano)

**Ruta:** `src/infrastructure/database/migrations/<timestamp>-AddOrderCustomizationSnapshots.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

// Snapshots de fidelidad de personalización (§016): el detalle del
// pedido reproduce la personalización del carrito — foto por slug,
// "Lleva:" efectivo, secciones por grupo y reemplazos emparejados.
// NULL/'{}' en filas viejas = degradación honesta; el backfill de
// product_slug es un join inequívoco (product_id nunca cambia).
export class AddOrderCustomizationSnapshots0000000000000
  implements MigrationInterface {
  name = 'AddOrderCustomizationSnapshots0000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items"
         ADD COLUMN "product_slug" varchar(120) NULL,
         ADD COLUMN "included_names" text[] NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item_modifiers"
         ADD COLUMN "modifier_group" varchar(50) NULL,
         ADD COLUMN "replaces_option_id" uuid NULL
           REFERENCES "modifier_options"("id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_oim_replaces_option"
         ON "order_item_modifiers" ("replaces_option_id")`,
    );
    await queryRunner.query(
      `UPDATE "order_items" oi SET "product_slug" = p."slug"
       FROM "products" p WHERE p."id" = oi."product_id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_oim_replaces_option"`);
    await queryRunner.query(
      `ALTER TABLE "order_item_modifiers"
         DROP COLUMN "replaces_option_id",
         DROP COLUMN "modifier_group"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items"
         DROP COLUMN "included_names",
         DROP COLUMN "product_slug"`,
    );
  }
}
```

Correr en dev + test; verificar `down()` limpio y re-aplicar (workflow).

## 6. `create-order.use-case.ts` (existente — actualización)

**Ruta:** `src/modules/orders/application/use-cases/create-order.use-case.ts`

Cuatro puntos:

**a) `OrderableOption` lleva el grupo — Antes:**
```typescript
interface OrderableOption {
  opt: ModifierOption;
  includedByDefault: boolean;
}
```
**Después:**
```typescript
interface OrderableOption {
  opt: ModifierOption;
  includedByDefault: boolean;
  groupSlug: string;
}
```

**b) `flattenOptions` propaga el slug del grupo — Antes:**
```typescript
    for (const g of product.modifierGroups) {
      for (const opt of g.options) {
        options.set(opt.id, {
          opt,
          includedByDefault: opt.includedByDefault,
        });
      }
    }
```
**Después:**
```typescript
    for (const g of product.modifierGroups) {
      for (const opt of g.options) {
        options.set(opt.id, {
          opt,
          includedByDefault: opt.includedByDefault,
          groupSlug: g.slug,
        });
      }
    }
```

**c) `modifier()` recibe grupo + vínculo del reemplazo — Antes:**
```typescript
  private modifier(
    opt: ModifierOption,
    action: 'added' | 'removed',
    delta: number,
  ): OrderItemModifier {
    const m = new OrderItemModifier();
    m.optionId = opt.id;
    m.optionName = opt.name;
    m.action = action as ModifierAction;
    m.priceDelta = delta;
    return m;
  }
```
**Después:**
```typescript
  private modifier(
    entry: OrderableOption,
    action: 'added' | 'removed',
    delta: number,
    replacesOptionId?: string,
  ): OrderItemModifier {
    const m = new OrderItemModifier();
    m.optionId = entry.opt.id;
    m.optionName = entry.opt.name;
    m.action = action as ModifierAction;
    m.priceDelta = delta;
    m.modifierGroup = entry.groupSlug;
    m.replacesOptionId = replacesOptionId ?? null;
    return m;
  }
```

**d) Llamadas + snapshots del ítem — Antes:**
```typescript
          mods.push(this.modifier(entry.opt, 'removed', 0));
          continue;
        }
        // added — ¿extra cobrado o reemplazo gratis (§021)?
        ...
          consumedReplacements.add(m.replacesOptionId);
          delta = 0;
        }
        mods.push(this.modifier(entry.opt, 'added', delta));
      }
      const unit = ...
      const item = new OrderItem();
      item.productId = product.id;
      item.productName = product.name;
      item.unitPrice = unit;
```
**Después:**
```typescript
          mods.push(this.modifier(entry, 'removed', 0));
          continue;
        }
        // added — ¿extra cobrado o reemplazo gratis (§021)?
        ...
          consumedReplacements.add(m.replacesOptionId);
          delta = 0;
        }
        mods.push(this.modifier(entry, 'added', delta, m.replacesOptionId));
      }
      const unit = ...
      const item = new OrderItem();
      item.productId = product.id;
      item.productName = product.name;
      item.productSlug = product.slug;
      item.includedNames = this.effectiveIncluded(options, dto);
      item.unitPrice = unit;
```

**e) Helper nuevo** (al lado de `flattenOptions`):
```typescript
  // "Lleva:" efectivo — incluidos por defecto de TODOS los grupos
  // menos los quitados/reemplazados (el replaced siempre trae fila
  // removed — validado arriba — así que un solo set alcanza).
  private effectiveIncluded(
    options: Map<string, OrderableOption>,
    dto: CreateOrderItemCommand,
  ): string[] {
    const removed = new Set(
      dto.modifiers.filter((m) => m.action === 'removed').map((m) => m.optionId),
    );
    const names: string[] = [];
    for (const { opt, includedByDefault } of options.values()) {
      if (includedByDefault && !removed.has(opt.id)) names.push(opt.name);
    }
    return names;
  }
```

## 7. `order-response.dto.ts` (existente — actualización)

**Ruta:** `src/modules/orders/application/dtos/order-response.dto.ts`

**Antes:**
```typescript
export class OrderItemModifierResponseDto {
  id!: string;
  optionId!: string | null;
  optionName!: string;
  action!: string;
  priceDelta!: number;
}
export class OrderItemResponseDto {
  id!: string;
  productId!: string;
  productName!: string;
  ...
  modifiers!: OrderItemModifierResponseDto[];
}
```

**Después:**
```typescript
export class OrderItemModifierResponseDto {
  id!: string;
  optionId!: string | null;
  optionName!: string;
  action!: string;
  priceDelta!: number;
  modifierGroup!: string | null;
  replacesOptionId!: string | null;
}
export class OrderItemResponseDto {
  id!: string;
  productId!: string;
  productName!: string;
  productSlug!: string | null;
  unitPrice!: number;
  quantity!: number;
  lineTotal!: number;
  notes!: string | null;
  includedNames!: string[];
  modifiers!: OrderItemModifierResponseDto[];
}
```

## 8. `order.mapper.ts` (existente — actualización)

**Ruta:** `src/modules/orders/application/mappers/order.mapper.ts`

En `toItemResponse` agregar:
```typescript
    dto.productSlug = i.productSlug;
    ...
    dto.includedNames = i.includedNames;
```
En `toModifierResponse` agregar:
```typescript
    dto.modifierGroup = m.modifierGroup;
    dto.replacesOptionId = m.replacesOptionId;
```

**El repository no cambia** — `em.save`/`find` ya persisten y devuelven las columnas nuevas vía schema.

## 9. `modelo-de-datos.md` (existente — actualización)

**Ruta:** `documentacion/modelo-de-datos.md`

`order_items` — agregar filas:
```
| `product_slug` | varchar(100) | NULL | Snapshot del slug — la app mapea assets por él (§016; NULL en filas previas) |
| `included_names` | text[] | NOT NULL, default '{}' | Snapshot "Lleva:" — incluidos por defecto menos quitados/reemplazados (§016) |
```

`order_item_modifiers` — agregar filas:
```
| `modifier_group` | varchar(50) | NULL | Snapshot del `modifier_groups.slug` origen — secciona el detalle (§016; NULL en filas previas) |
| `replaces_option_id` | uuid FK → `modifier_options` | NULL | Solo filas `added` del cambio gratis: el incluido que reemplaza (§016) |
```

`Decisiones tomadas (orders)` — agregar:
```
- **Fidelidad de personalización** (propuesta 016): `product_slug`, `included_names`, `modifier_group` y `replaces_option_id` son snapshots al crear — el detalle del cliente reproduce el carrito idéntico, aunque la carta cambie después. Filas previas quedan NULL/vacías y el consumidor degrada.
```

## 10. Docs de API (4 archivos — actualización de ejemplos)

`documentacion/api/orders/`:

- **`003-get-orders-id.md`** — el ejemplo 200 agrega en items: `"productSlug": "el-cachorro"`, `"includedNames": ["Pan artesanal","Salchicha americana","Queso mozzarella"]` (sin la quitada); en modifiers: `"modifierGroup": "ingredients"`, `"replacesOptionId": null`. Nota nueva: filas previas a §016 devuelven `null`/`[]`.
- **`001-post-orders.md`** — el response 201 agrega los mismos 4 campos en el ejemplo.
- **`002-get-orders.md`** — items del listado también traen `productSlug`/`includedNames` (viven en `order_items`, salen gratis en el batch); `modifiers` sigue `[]`.
- **`004-post-orders-id-cancel.md`** — el response 200 agrega los 4 campos.

## 11. Tests

- **`create-order.use-case.spec.ts`** — asserts: `productSlug` poblado; `includedNames` = incluidos menos quitados (ítem sin personalizar = todos); `modifierGroup` = slug del grupo en removed/added; `replacesOptionId` set en la fila added del reemplazo y null en la removed/extra.
- **`order.repository.spec.ts`** — round-trip: los 4 campos persisten y vuelven por `findByIdForCustomer`.
- **`orders.e2e-spec.ts`** — POST devuelve los campos; GET :id los repite (slug real del producto sembrado); la fila added del reemplazo trae `replacesOptionId` apuntando al removed.

## Orden de aplicación

1. Entidades + schemas + migración (run dev + test + revert-check)
2. Use-case (poblado de snapshots)
3. DTO + mapper
4. Specs + e2e + docs (modelo + api)
5. `npx tsc --noEmit` + `npm run test` + `npm run test:e2e`

---

## Encuesta de revisión (cerrada — aprobado)

| Decisión | Resultado |
|---|---|
| `modifier_group` guarda… | **slug del grupo** (`ingredients`/`toppings`/`sauces`) — clave estable que la app ya conoce |
| `included_names` cubre… | **todos los grupos** — cualquier `included_by_default` menos quitados; si otro grupo incluye defaults mañana, aparece (hoy el resultado es idéntico a "solo ingredients") |
| Backfill de filas viejas | **solo `product_slug`** (join inequívoco) — `included_names`/`modifier_group` no se reconstruyen: asumiría catálogo actual = catálogo del pedido, la suposición que los snapshots existen para evitar |
| Tipo de `included_names` | **`text[]` de nombres** — snapshot puro como `option_name`; reportes por ingrediente ya los da `option_id` |

---

## Anexo — correcciones del `revisor` (aplicadas)

| Hallazgo | Corrección |
|---|---|
| IMPORTANTE: `product_slug varchar(100)` pero `products.slug` es `varchar(120)` — snapshot debe ser del mismo ancho que la fuente | `varchar(120)` en migración + schema + modelo-de-datos (la migración se revirtió y re-aplicó corregida — aún no commiteada) |
| MENOR: migración sin `name` (las 10 previas lo declaran) | `name = 'AddOrderCustomizationSnapshots<ts>'` agregado |
| MENOR: `replaces_option_id` sin índice (la FK `option_id` sí lo tiene) | `idx_oim_replaces_option` en up + DROP en down |
| MENOR: `order.mapper.spec.ts` sin los 4 campos nuevos | fixture + asserts agregados |
| MENOR: sin test de `included_names` multi-grupo | spec nuevo: incluido en `toppings` también entra al "Lleva:" |
| MENOR: indentación 4 espacios en la migración | reindentada a 2 |
| Fuera del review: `npm run migration:create` roto (`-d` no aceptado por `create`) | `package.json` — script sin `-d` (la propuesta ya lo usa) |

Verificación: tsc limpio · 219 unitarios → re-correr tras los fixes · migración run+revert+run en dev y test verificada.
