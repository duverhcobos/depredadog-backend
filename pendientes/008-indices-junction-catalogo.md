# Pendiente: Índices en junctions del catálogo (product_modifier_groups/options)

> **Estado: ✅ RESUELTO — no requería índices** (propuesta 013, corrección
> post-revisión): la premisa de este pendiente era errónea. Ambas
> junctions tienen PK compuesto `(product_id, …)` — un btree compuesto
> **ya sirve** `WHERE product_id IN (...)` por prefijo izquierdo.
> Verificado con `EXPLAIN` en test: Bitmap Heap Scan vía pkey (en dev el
> planner elige seq scan solo porque la tabla está casi vacía — óptimo
> igual). Se llegó a crear la migración `AddCatalogJunctionIndexes`, se
> aplicó, y se revirtió/borró sin commit al detectar la redundancia.
> **Producto:** backend

## Contexto

`CatalogRepository.getMenu()` consulta `product_modifier_groups` y
`product_modifier_options` con `WHERE product_id IN (...)`. El análisis
original afirmaba "solo pkey" como si el PK compuesto no indexara
`product_id` — incorrecto: `PRIMARY KEY (product_id, group_id)` y
`PRIMARY KEY (product_id, option_id)` cubren ese filtro.

## Criterio de cierre — cumplido

- `EXPLAIN` verificado en test: index scan vía pkey, sin índices
  dedicados. No quedan índices redundantes en ninguna BD.
