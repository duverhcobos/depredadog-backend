# Propuesta §027 — Motor de promociones/combos (carta del dueño)

> **Estado:** propuesta para aprobación
> **Módulo:** orders (pricing) + catalog (descubrimiento)
> **Decisión del dueño 2026-11-20:** carta de combos ya cerrada —
> comida al 40% de margen, bebidas FUERA de toda regla, perros de
> combo personalizables con extras cobrados aparte, activación
> automática + sección Combos en la app.

## Contexto

El dueño definió 4 ofertas (ver `pendientes/017` app). Modelarlas
como productos no funciona: "2-3 perros a elección + papas gratis"
y "4+ perros −15%" son **reglas sobre el contenido del pedido**,
no ítems. El modelo correcto es un **motor de promociones
server-side**: los ítems llegan sueltos (cada perro con sus
modificadores), el servidor detecta patrones elegibles y aplica el
descuento — igual que el counter físico ("pídelo así y sale más
barato"). `orders.discount` ya existe en schema para esto.

## Reglas a implementar (la carta, exacta)

| Slug | Regla | Mecánica |
|------|-------|----------|
| `combo-cachorro` | Cachorro + Papas francesa | bundle fijo → **$17.000** (ahorra $2.000) |
| `papas-gratis` | 2-3 unidades de perros elegibles | **1× Papas francesa gratis** ($5.000 off) |
| `duo-alfa` | *exhibidor de `papas-gratis` sobre 2× Depredador* — misma mecánica, card aparte en la app (no regla aparte) | $36.000 |
| `manada-15` | 4+ unidades de perros elegibles | **−15%** sobre las líneas de esos perros |

- `eligibleProductIds` = los 6 perros (config explícita, no por
  categoría — una promo futura puede excluir uno).
- `papas-gratis` aplica 2-3 unidades; a 4+ la reemplaza `manada-15`
  (tiers mutuamente excluyentes — NO stackean).
- El −15% es **solo sobre las líneas de perro elegibles**
  (su lineTotal con modificadores — "el perro completo"); papas,
  bebidas, & más y deliveryFee quedan a precio normal.
- Las papas gratis se **auto-agregan** si el pedido no las trae
  ("las papas van de la casa" — llegan sí o sí); si el cliente ya
  las pidió, esa línea la cubre el descuento. 2 papas pedidas =
  1 gratis + 1 pagada.
- Modificadores cobran aparte: el bundle/descuento cubre los base
  price; los `priceDelta` de extras suman normal en la línea.

## Diseño

### Nueva tabla `promotions` (migración)

| Col | Tipo |
|-----|------|
| id | uuid pk |
| slug | varchar unique |
| name | varchar — "Combo Cachorro" |
| tagline | varchar — "Un antojo bien cazado." |
| kind | enum: `fixed_bundle` · `free_item` · `percent_off` |
| config | jsonb — ver abajo |
| is_active | bool |
| sort_order | int |

Config por kind:
```jsonc
// fixed_bundle — ahorro = Σ(basePrice×qty componentes) − price
{ "items": [{"productId":"...","qty":1}], "price": 17000 }
// free_item — N..M unidades elegibles → freeQty de freeProductId a $0
{ "eligibleProductIds":[6 perros], "minQty":2, "maxQty":3,
  "freeProductId":"...papas", "freeQty":1 }
// percent_off — N+ unidades elegibles → percent% de sus lineTotals
{ "eligibleProductIds":[6 perros], "minQty":4, "percent":15,
  "roundDownTo": 500 }
```

### `PromotionEvaluator` (orders/domain)

Servicio de dominio puro (sin I/O — recibe ítems ya construidos +
definiciones, devuelve resultado). Entrada: `BuiltOrderItem[]`
(itemsBuilder ya validó catálogo y calculó lineTotals). Salida:

```ts
{
  discount: number;                    // suma a orders.discount
  appliedPromotions: AppliedPromotion[]; // [{slug,name,saving}] snapshot
  extraItem?: { productId, quantity }; // papas auto-agregada
}
```

Algoritmo (greedy best-savings):
1. Expandir ítems a unidades (`quantity` cuenta unidades).
2. Evaluar `percent_off` primero (tier mayor) → si ≥minQty unidades
   elegibles: `saving = floor(percent × ΣlineTotals elegibles /
   roundDownTo) × roundDownTo`; consume esas unidades.
3. `free_item`: unidades elegibles restantes en rango → saving =
   basePrice del freeProduct × freeQty; si el pedido ya tiene el
   producto, el saving cubre su línea; si no, marca `extraItem`
   para inyectarlo (builder lo construye con snapshots reales y
   el descuento lo deja en $0 neto).
4. `fixed_bundle`: con las unidades restantes, contar sets
   completos posibles → saving × sets; consume unidades.
5. Cada unidad se consume una vez — las promos no compiten por el
   mismo perro.

### Integración en los 2 create

- `create-order` y `create-in-person-order` tras `itemsBuilder.build`:
  `evaluator.evaluate(items, activePromos)` → si `extraItem`,
  construirlo con el builder y apendarlo; luego
  `order.discount = result.discount`,
  `order.total = subtotal + deliveryFee − discount`,
  `order.appliedPromotions = result.appliedPromotions` (snapshot).
- **`minDeliveryOrder` evalúa `subtotal − discount`** — el mínimo
  es sobre lo que el cliente paga, no el valor de carta.
- `payments.amount` sigue = `order.total` (ya con descuento).

### Persistencia — 1 columna en `orders`

`applied_promotions` **jsonb nullable** — snapshot
`[{slug,name,saving}]` al estilo de los demás snapshots del módulo
(sobrevive a desactivar la promo después). `discount` reusa la
columna existente (default 0 — hoy nunca se escribe).

### Contrato

- `OrderResponseDto` + `AdminOrderResponseDto`: `discount`,
  `appliedPromotions[]` nuevos en la respuesta (backward compat:
  pedidos viejos devuelven `discount: 0`, `appliedPromotions: []`).
- `GET /catalog` agrega `promotions: [{slug,name,tagline,kind,
  display: {priceLabel, componentProductIds?}}]` — solo activas,
  por sort_order. `duo-alfa` se semilla como card fixed_bundle
  exhibidor? NO — se semilla `papas-gratis` + `manada-15` +
  `combo-cachorro` y `duo-alfa` como **card presentacional**
  (kind `showcase`: nombre/tagline/precio para mostrar, sin
  evaluación — el motor la cubre vía `papas-gratis`).
- Doc `documentacion/api/` de orders + catalog actualizada.

### Migración + seeds

- `CreatePromotionsTable` + `AddAppliedPromotionsToOrders`.
- `promotions.seed.ts` (idempotente, invocable desde reset.seed):
  las 4 entradas de la carta — `combo-cachorro` (fixed_bundle),
  `papas-gratis` (free_item), `duo-alfa` (showcase), `manada-15`
  (percent_off). `eligibleProductIds` = los 6 perros; freeProduct
  = papas-francesa.

## Archivos

- migración + schemas `promotion.schema.ts`, `applied_promotions` col
- `promotions/domain`: entidad, `PromotionEvaluator` + spec
- `orders/application`: promo definitions port/repo (infra TypeORM),
  integración en ambos create + specs
- `catalog`: `promotions` en `CatalogResponseDto` + repo + spec
- orders response DTOs + mappers + spec (`discount`, `appliedPromotions`)
- `promotions.seed.ts` + wiring en `reset.seed.ts`
- `documentacion/api/orders.md`, `catalog.md`

## Casos de prueba clave

- 1× Cachorro + 1× papas → discount 2000 (no importa extras: +
  mozzarella ×2 → discount sigue 2000 y el extra suma).
- 2× cualquier perro sin papas → papas inyectada a $0 (discount 5000).
- 2× perros + 1 papas → discount 5000. Con 2 papas → sigue 5000.
- 4× perros → −15% sobre lineTotals, redondeo a $500; NO papas
  gratis (tier exclusivo).
- 3× perros + Cachorro+papas set → mejor combinación para el
  cliente (regla gana a bundle aquí: papas free cubre la papas).
- Bebida en el pedido → nunca descuenta (el % solo toca perros).
- Pedido sin nada aplicable → discount 0, appliedPromotions [].
- `minDeliveryOrder` con descuento que baja del mínimo → 409.
- Idempotencia del seed; promo inactiva no evalúa.

## Fuera de alcance

Promociones con fecha de vigencia, cupones por código, promos por
canal (solo delivery), combos con bebida, y el preview server-side
del precio (la app evalúa local — ver §046).
