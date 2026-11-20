# Propuesta: Porciones extra repetibles — `times` en modificadores de ítem

Regla de negocio del usuario: un ingrediente — incluido o no — se puede
**repetir como adicional cobrado N veces** (doble/triple mozzarella…).

Hoy `OrderItemModifierDto` es binario (`added`/`removed`, una fila por
opción) y el builder rechaza `optionId` duplicado con
`duplicate modifier` — la protección sigue siendo válida: en vez de N
filas del mismo optionId va **una fila con `times`**, lo que mantiene la
unicidad por opción y hace el intento explícito.

`times` es opcional con default 1 → **contrato backward-compatible**: la
app vieja sigue mandando filas sin el campo y todo se comporta igual.

Alcance por acción:
- `added`: `times` ≥ 1, **sin tope** (decisión del usuario — "la gente
  puede repetir" no tiene límite; pedidos de evento/grupo son válidos)
  → `priceDelta = extraPrice × times`.
- `removed`: `times` debe ser 1 (o ausente) — no se puede quitar 3
  mozzarellas de un perro que lleva 1 → violación.
- `replacesOptionId` (§021): `times` debe ser 1 — el cambio gratis es
  1:1 por diseño → violación.

Snapshot: `order_item_modifiers` guarda `times` y `price_delta` como
total de línea (extra × times) — `unit_price` del ítem no cambia de
fórmula (`base + Σ added.priceDelta`).

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/infrastructure/database/migrations/<ts>-AddTimesToOrderItemModifiers.ts` | columna `times int NOT NULL DEFAULT 1` |
| `src/infrastructure/database/schemas/order-item-modifier.schema.ts` | columna `times` |
| `src/modules/orders/domain/entities/order-item-modifier.entity.ts` | campo `times` |
| `src/modules/orders/application/dtos/create-order.dto.ts` | `times?: number` en `OrderItemModifierDto` |
| `src/modules/orders/domain/services/order-items-builder.service.ts` | validación por acción + `delta × times` |
| `src/modules/orders/application/mappers/order.mapper.ts` (o el mapper de respuesta) | `times` en la respuesta de modificadores |
| `src/modules/orders/.../*.spec.ts` | casos: added×N cobra N×extra, removed×N rechaza, replace×N rechaza, default 1 |
| `documentacion/api/<doc de create-order>` | campo `times` documentado con ejemplo |

`migration:create` genera el timestamp del archivo — no inventarlo.

---

## 1. Migración (archivo nuevo — `migration:create`)

**Ruta:** `src/infrastructure/database/migrations/<timestamp>-AddTimesToOrderItemModifiers.ts`

```typescript
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTimesToOrderItemModifiers<Ts> implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'order_item_modifiers',
      new TableColumn({
        name: 'times',
        type: 'int',
        isNullable: false,
        default: 1,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('order_item_modifiers', 'times');
  }
}
```

Correr `migration:run` en dev y en la BD de test, verificar `revert`
limpio en test y re-aplicar (checklist del workflow).

## 2. `order-item-modifier.schema.ts` (existente — actualización)

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
    times: { type: 'int', default: 1 },
```

## 3. `order-item-modifier.entity.ts` (existente — actualización)

**Ruta:** `src/modules/orders/domain/entities/order-item-modifier.entity.ts`

**Antes:**
```typescript
  priceDelta = 0;
  /** Snapshot del slug del grupo origen (§016) — la app secciona el
   *  detalle con él; null en filas previas a §016. */
```

**Después:**
```typescript
  priceDelta = 0;
  /** Porciones del adicional (§026): solo aplica a filas `added` —
   *  `priceDelta` ya es el total de línea (extra × times). Removed y
   *  reemplazos gratis siempre son 1. */
  times = 1;
  /** Snapshot del slug del grupo origen (§016) — la app secciona el
   *  detalle con él; null en filas previas a §016. */
```

## 4. `create-order.dto.ts` (existente — actualización)

**Ruta:** `src/modules/orders/application/dtos/create-order.dto.ts`

**Antes:**
```typescript
export class OrderItemModifierDto {
  @IsUUID()
  optionId!: string;

  @IsIn(['added', 'removed'])
  action!: 'added' | 'removed';

  /** Solo en `added` de un reemplazo gratis (§021): apunta al
   * ingrediente incluido agotado que esta opción reemplaza. */
  @IsUUID()
  @IsOptional()
  replacesOptionId?: string;
}
```

**Después:**
```typescript
export class OrderItemModifierDto {
  @IsUUID()
  optionId!: string;

  @IsIn(['added', 'removed'])
  action!: 'added' | 'removed';

  /** Porciones del adicional (§026) — solo válido en `added`:
   * entero ≥ 1, SIN tope (decisión del usuario). Ausente = 1.
   * Removed/reemplazo deben venir en 1. */
  @IsInt()
  @Min(1)
  @IsOptional()
  times?: number;

  /** Solo en `added` de un reemplazo gratis (§021): apunta al
   * ingrediente incluido agotado que esta opción reemplaza. */
  @IsUUID()
  @IsOptional()
  replacesOptionId?: string;
}
```

Verificar imports: `Min` y `IsInt` ya están en el archivo (OrderItemDto
los usa); `Max` también (quantity). Si falta alguno agregarlo al import
de `class-validator`.

**Nota — DTO admin:** si `create-admin-order.dto.ts` reutiliza
`OrderItemModifierDto` queda cubierto gratis; si tiene su propio DTO de
modificador, aplicarle el mismo campo.

## 5. `order-items-builder.service.ts` (existente — actualización)

**Ruta:** `src/modules/orders/domain/services/order-items-builder.service.ts`

**Antes** (rama `removed` + `added`, ~línea 100):
```typescript
        if (m.action === 'removed') {
          if (!entry.includedByDefault || !entry.opt.isRemovable) {
            throw new OrderCatalogViolationException(
              `option ${entry.opt.name} cannot be removed`,
            );
          }
          mods.push(this.modifier(entry, 'removed', 0));
          continue;
        }
        // added — ¿extra cobrado o reemplazo gratis (§021)?
        if (!entry.opt.isAvailable) {
          throw new OrderCatalogViolationException(
            `option ${entry.opt.name} unavailable`,
          );
        }
        let delta = entry.opt.extraPrice;
        if (m.replacesOptionId) {
          const replaced = options.get(m.replacesOptionId);
          const hasRemovedRow = dto.modifiers.some(
            (x) => x.optionId === m.replacesOptionId && x.action === 'removed',
          );
          const ok =
            replaced?.includedByDefault &&
            replaced.opt.isReplaceable &&
            entry.opt.isReplacementEligible &&
            hasRemovedRow &&
            !consumedReplacements.has(m.replacesOptionId);
          if (!ok) {
            throw new OrderCatalogViolationException(
              `invalid free replacement of ${entry.opt.name}`,
            );
          }
          consumedReplacements.add(m.replacesOptionId);
          delta = 0;
        }
        mods.push(this.modifier(entry, 'added', delta, m.replacesOptionId));
```

**Después:**
```typescript
        const times = m.times ?? 1;
        if (m.action === 'removed') {
          if (!entry.includedByDefault || !entry.opt.isRemovable) {
            throw new OrderCatalogViolationException(
              `option ${entry.opt.name} cannot be removed`,
            );
          }
          if (times !== 1) {
            throw new OrderCatalogViolationException(
              `option ${entry.opt.name} removed must be times=1`,
            );
          }
          mods.push(this.modifier(entry, 'removed', 0));
          continue;
        }
        // added — ¿extra cobrado o reemplazo gratis (§021)? La porción
        // repetida (§026) multiplica el delta; el cambio gratis sigue
        // siendo 1:1.
        if (!entry.opt.isAvailable) {
          throw new OrderCatalogViolationException(
            `option ${entry.opt.name} unavailable`,
          );
        }
        let delta = entry.opt.extraPrice * times;
        if (m.replacesOptionId) {
          const replaced = options.get(m.replacesOptionId);
          const hasRemovedRow = dto.modifiers.some(
            (x) => x.optionId === m.replacesOptionId && x.action === 'removed',
          );
          const ok =
            times === 1 &&
            replaced?.includedByDefault &&
            replaced.opt.isReplaceable &&
            entry.opt.isReplacementEligible &&
            hasRemovedRow &&
            !consumedReplacements.has(m.replacesOptionId);
          if (!ok) {
            throw new OrderCatalogViolationException(
              `invalid free replacement of ${entry.opt.name}`,
            );
          }
          consumedReplacements.add(m.replacesOptionId);
          delta = 0;
        }
        mods.push(
          this.modifier(entry, 'added', delta, m.replacesOptionId, times),
        );
```

El helper `this.modifier(...)` recibe `times` (default 1 en firma si
conviene) y lo asigna a la entidad: `row.times = times`.

## 6. Mapper de respuesta + documentación API

- El mapper que convierte `OrderItemModifier` → DTO de respuesta debe
  exponer `times` (los consumidores — detalle de pedido cliente, panel
  admin, card de cocina — muestran "Mozzarella ×3").
- `documentacion/api/` — el doc del endpoint de creación de pedidos (y el
  admin si tiene doc propia) documenta `times` con ejemplo
  `{ "optionId": "…", "action": "added", "times": 2 }`.

## 7. Specs

En el spec del builder/use-case existente agregar:

- `added` con `times: 3` → `priceDelta = extraPrice × 3` y `unit` lo suma.
- `added` sin `times` → comportamiento actual (1, delta = extra).
- `removed` con `times: 2` → `OrderCatalogViolationException`.
- `added` con `replacesOptionId` + `times: 2` → violación.
- `times: 0` / negativo / decimal → class-validator rechaza antes del
  builder (e2e o validation pipe spec si existe patrón).

---

## Orden de aplicación

1. DTO (`times` validado) — la forma del contrato define todo lo demás
2. Entidad + schema + migración — persistencia
3. Builder (validación + delta) — la lógica
4. Mapper de respuesta
5. Specs — `npm run test`
6. `npm run build` + `migration:run` dev/test + `migration:revert` test + re-run
7. Documentación API en el mismo commit
