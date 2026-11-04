# Pendiente: Orders debe re-validar las reglas del catálogo en el servidor

> **Estado: 🔴 PENDIENTE** — detectado en evaluacion-modulo de catalog;
> se resuelve dentro del módulo orders
> **Producto:** backend
> **Bloqueo:** bloqueante para orders — el pedido nunca puede confiar en
> el total ni en la disponibilidad que calcula el cliente

## Contexto

Las reglas de negocio del catálogo hoy las deriva la **app** desde el
payload de `GET /catalog`:

- **Agotado efectivo del producto**: `isAvailable` del producto AND
  ninguna opción INCLUIDA `isEssential` agotada — la entidad
  `CatalogProduct.isSellable` la calcula en el cliente.
- **Cambio gratis 1:1**: ingrediente incluido agotado con
  `isReplaceable` → UN adicional `isAvailable && isReplacementEligible`
  sin costo, y el mismo candidato no se repite entre agotados.
- **Precio**: total = basePrice + Σ extraPrice de adicionales — el
  backend nunca debe aceptar el total que manda el cliente.

En lectura está bien que sea derivación del consumidor; en **escritura**
(crear/confirmar pedido) el servidor es la autoridad — si no re-valida,
un cliente modificado podría pedir productos agotados, regalarse extras
pagos como "reemplazo" o mandar un total menor.

## Qué falta (al implementar orders)

- Re-validar server-side al crear/confirmar el pedido:
  - Producto vendible: `is_available` + esenciales incluidos disponibles.
  - Cada reemplazo declarado: opción agotada `is_replaceable`, candidato
    `is_available && is_replacement_eligible`, sin repetir candidato,
    costo 0.
  - Extras: disponibles y cobrados según `extra_price` del servidor.
  - Recalcular el total en backend; rechazar si difiere del enviado.
- Decidir el shape del request de pedido para expresar quitar/extras/
  reemplazos (el modelo de la app ya tiene `removed`/`extras`/
  `replacements` como sets/maps por optionId).

## Criterio de cierre

- `POST /orders` (o equivalente) rechaza pedidos que violan las reglas
  con e2e que lo pruebe (agotado esencial, candidato duplicado, extra
  regalado, total adulterado).
