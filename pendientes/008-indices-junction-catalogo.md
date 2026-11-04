# Pendiente: Índices en junctions del catálogo (product_modifier_groups/options)

> **Estado: 🔴 PENDIENTE** — detectado en evaluacion-modulo de catalog
> **Producto:** backend
> **Bloqueo:** recomendado — seq scan aceptable con menú chico, pero la
> convención de `listados-paginacion-indices` es obligatoria

## Contexto

`CatalogRepository.getMenu()` consulta `product_modifier_groups` y
`product_modifier_options` con `WHERE product_id IN (...)` — ninguna de
las dos tablas tiene índice por `product_id` (solo pkey). Todas las demás
FK consultadas del catálogo sí están indexadas
(`products.category_id+sort`, `product_images.product_id+sort`,
`modifier_options.group_id+sort`).

Con el menú de un solo negocio (~7 productos × pocas decenas de filas)
el seq scan es imperceptible — no es urgente, es una convención
incumplida.

## Qué falta

- Migración con `CREATE INDEX` en:
  - `product_modifier_groups(product_id)`
  - `product_modifier_options(product_id)`
- Verificar `revert` en dev y test como siempre.

## Criterio de cierre

- Ambos índices existen en dev y test; `EXPLAIN` de las dos queries del
  repositorio muestra index scan.
