---
name: listados-paginacion-indices
description: Convención obligatoria de paginación e índices para cualquier endpoint de listado de este backend (GET que devuelve varias filas), y regla anti-N+1 para cualquier query que cargue relaciones
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

# Paginación e índices en endpoints de listado

Cualquier endpoint que devuelva una **colección** (productores, recepciones, ventas, liquidaciones, etc.) sigue esta convención — decidida antes de implementar los primeros endpoints de negocio, para no tener que rehacer contratos de API o reindexar tablas con datos ya en producción.

## Paginación

- **Nunca** un listado sin límite máximo de filas. Un `SELECT *` sin tope sobre una tabla que crece sin límite (recepciones, movimientos de inventario) es exactamente el tipo de problema que se vuelve caro de arreglar después.
- Usar el DTO compartido `src/common/dtos/pagination-query.dto.ts` (`PaginationQueryDto`) como query params de cualquier endpoint de listado: `page` (default 1) y `limit` (default 20, máximo 100 — `@Max(100)`, hace que Nest rechace con 400 un `limit` mayor en vez de dejarlo pasar).
- La respuesta envuelve los resultados con `src/common/dtos/paginated-response.dto.ts` (`PaginatedResponseDto<T>`): `{ items: T[], meta: { page, limit, total, totalPages } }`. Para que Swagger documente el tipo real de `items` (no `Object`), extender la clase en el `swagger-schema` del módulo — ver el comentario de ejemplo al final de `paginated-response.dto.ts`.
- El use-case recibe `page`/`limit` (o el DTO completo) y usa `PaginationQueryDto.offset` para el `skip` de TypeORM (`repository.find({ skip, take: limit, ... })`), en vez de recalcular `(page - 1) * limit` en cada lugar.
- Este contrato (`page`/`limit`, no cursor) es una decisión deliberada y simple — suficiente para un volumen moderado de usuarios de app, no una API pública de alto volumen. Si en el futuro se necesita paginación por cursor (para datasets muy grandes o con inserciones concurrentes), es un cambio de contrato deliberado, no algo a mezclar por endpoint.

## Índices

- Toda tabla de negocio filtra siempre por `tenant_id` (ver skill `rls-tenant-isolation`), así que **el índice compuesto siempre empieza por `tenant_id`**: `(tenant_id, <columna(s) de filtro/orden habitual>)`. Ejemplos:
  - Listado de productores por organización, ordenado por nombre → `(tenant_id, nombre)`.
  - Listado de recepciones por rango de fecha → `(tenant_id, fecha_recepcion)`.
  - Un índice solo por `tenant_id` sin la segunda columna sirve para el filtro pero no ayuda al `ORDER BY`/paginación estable — agregar la columna de orden habitual del listado.
- Definir el índice en la **misma migración** que crea la tabla, no como una migración separada "de optimización" después — evita reindexar una tabla con datos reales en producción.
- Al paginar con `skip`/`take` de TypeORM sobre una tabla grande, el índice compuesto es lo que evita que cada página de resultados escanee la tabla completa.

## N+1 — una sola query, no una por fila

Aplica a **todo** endpoint, no solo listados: si la respuesta necesita datos de entidades relacionadas, se cargan en **un solo query** con joins — nunca una query por fila ni por relación.

- **Patrón correcto** — `createQueryBuilder` con `leftJoinAndSelect` (ejemplo real: `UsuarioRepository.findByEmail` carga `user` + `usuarioRoles`→`rol` + `perfil` + `organizacion` en una query, propuesta) o `find({ relations: [...] })` para casos simples.
- **Anti-patrones prohibidos**:
  - `for (const x of lista) await repo.findById(x.id)` — N queries.
  - `await Promise.all(ids.map((id) => repo.findById(id)))` — mismo N+1, solo más rápido de romper la BD. Usar `findBy({ id: In(ids) })` — **una** query con `WHERE id IN (...)`.
  - Cargar la lista en el use-case y resolver cada relación en el mapper — mismo problema, disfrazado.
- **Joins, no lazy loading**: las relaciones del schema se cargan solo cuando la query las pide (`leftJoinAndSelect`) — nunca habilitar `eager: true` global en una entidad (cada `find` arrastraría la relación aunque no se necesite).
- Señal en code review: si un método de repositorio devuelve una entidad y el caller luego hace otra query "para completarla" (roles, perfil, org...), es un N+1 a medio camino — la query del repo debe devolver la vista completa que el endpoint necesita.

## Totales y agregados: siempre del servidor

Si la UI muestra un **total del listado** (Σ monto, "X por cobrar", conteo del filtro, promedios), ese número lo calcula el **backend en SQL** y viaja en `summary` del envelope — nunca un `fold`/Σ del cliente sobre las filas paginadas.

- **Por qué**: paginar rompe cualquier Σ del cliente — un fold sobre los items cargados muestra el total de *la página*, no *del filtro*, y crece a medida que el usuario scrollea (bug real detectado en producción-dev: un listado mostraba el total de la página 1 como si fuera el global).
- **Contrato**: `{ items, meta, summary: { <agregado>: "…" } }` — string-numeric con `toFixed(2)` para montos. El agregado se calcula **sin paginar y con los mismos filtros** del listado: extraer el builder del WHERE a un método compartido del repositorio — si el filtro crece, crece en un solo sitio.
- **Una query agregada, no N+1**: `SUM(...) OVER ()` (window function) en la misma query del listado, o una segunda query `SUM` con el WHERE compartido.
- Al revisar una propuesta de listado: si la pantalla destino muestra un total y el endpoint no lo devuelve, la propuesta está incompleta.

## Cuándo aplicar esta skill

- Al diseñar cualquier endpoint `GET` que devuelva una lista (no un recurso único por `id`).
- Al escribir la migración de una tabla de negocio nueva — decidir ahí mismo el índice compuesto según el listado más común sobre esa tabla.
- Al revisar una propuesta: un endpoint de listado sin `PaginationQueryDto`/`PaginatedResponseDto`, una tabla nueva sin su índice `(tenant_id, ...)`, o un repositorio que resuelve relaciones en loop en vez de con joins, está incompleto.
