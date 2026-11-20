# Propuesta 025 — Reset de producción: wipe total + menú real

## Contexto

El usuario decidió que la base de datos de producción (Supabase) debe nacer de
cero con **solo datos reales del negocio**: “vacíe toda la base de datos, y crea
desde cero lo que le estoy diciendo, nada de lo que estábamos trabajando en
local va ahí”.

El menú real llegó en imágenes de la carta física (5 de 6 perros confirmados;
falta la imagen de El Cachorro). Diferencias vs. el seed actual: precios
corregidos, `Salami`→`Peperoni`, y **el usuario descartó** papas, bebidas,
combos, modificadores (adicionales/toppings/salsas) y cuenta admin — todo eso
“no va por ahora”.

## Alcance del wipe (todas las tablas de negocio)

`payments`, `order_item_modifiers`, `order_items`, `orders`, `day_closes`,
`product_modifier_options`, `product_modifier_groups`, `combo_items`,
`product_images`, `modifier_options`, `modifier_groups`, `products`,
`categories`, `tables`, `business_hours`, `store_settings`, `addresses`,
`devices`, `auth_tokens`, `refresh_tokens`, `users`.

**Sobrevive**: la tabla `migrations` (historial del esquema — no es data de
negocio) y el esquema completo.

Bloqueadores FK que obligaban a este orden: `order_items.product_id` →
`products` (RESTRICT), `order_item_modifiers.option_id` → `modifier_options`,
`payments.order_id` → `orders`. `TRUNCATE … CASCADE` resuelve todo atómicamente.

## Datos a recrear (única fuente de verdad: la carta del usuario)

- `categories`: solo `perros` (sin `mas`/`bebidas`/`combos` — “no van”).
- `products`: 6 perros con precios de la carta. Sin `product_modifier_*`
  (sin adicionales/toppings/salsas por ahora). `is_featured` en El Depredador.
  Descripción = tagline + lista de ingredientes de la carta (sin mods no hay
  otra forma de que el cliente vea qué lleva).
- `store_settings`: 1 fila mínima — **requerida**: sin ella `/store/config`
  lanza `StoreNotConfiguredException` (404) y el home de la app muestra error.
- `business_hours`: 7 filas para el cálculo abierto/cerrado.
- **NO se recrea**: `tables`, `users`, ni ningún modificador.

## Archivos

- **NUEVO** `src/infrastructure/database/seeds/reset.seed.ts` — wipe +
  re-seed en una transacción. Guarda de seguridad: exige `RESET_CONFIRM=yes`
  en el env o aborta (evita wipe accidental en dev). Reutiliza
  `seedCatalogData()` exportada de `catalog.seed.ts` (fuente única del menú).
- **`catalog.seed.ts`** — reescrito al menú real mínimo (6 perros, sin mods).
  Exporta `seedCatalogData(manager)`; `main()` solo corre si el archivo es el
  entrypoint (`require.main === module`) → sigue idempotente para dev.
- **`package.json`** — script `seed:reset`.
- `store.seed.ts`/`admin.seed.ts` quedan como seeds de dev únicamente (prod no
  los corre: sin mesas ni admin por ahora).

## Valores store_settings (placeholders marcados — confirmar con el dueño)

name=`Depredadog`, address=`Cl. 7ª, Pueblo Nuevo, Arauquita, Arauca`,
phone=NULL, delivery_fee=2000, min_delivery_order=10000.
Horario placeholder: mar–sáb 17:00–23:00, dom 16:00–23:00, lunes cerrado.

## Ejecución

1. `npm run build` (compila seeds también).
2. Contra Supabase: `RESET_CONFIRM=yes npm run seed:reset` con env de prod.
3. Verificar `/health`, `GET /catalog` (6 perros, precios reales),
   `GET /store/config` (200, no 404), `POST /auth/login` → 401 (sin users).
4. Push a `main` → Render redespliega (los seeds no corren en runtime).

## Consecuencias aceptadas

- Sin `users` nadie puede loguearse en prod → sin Cocina/admin hasta sembrar
  admin después (el dueño lo pidió: “no va por ahora”).
- Sin modificadores los perros no son personalizables y el detalle muestra
  ingredientes vía descripción.
- Pedidos de prueba (~15) se pierden — todos eran tests del deploy.
