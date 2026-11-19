# Pendiente: Endpoint de listado de cierres de caja (GET /admin/day-closes)

> **Estado: 🔴 PENDIENTE** — detectado en evaluacion-modulo de orders/admin
> **Producto:** backend
> **Bloqueo:** menor — cada cierre queda auditado en la tabla
> `day_closes` pero no hay forma de consultarlos vía API; el dueño
> solo ve el snapshot del cierre que acaba de hacer.

## Contexto

`POST /admin/day-close` persiste el registro en `day_closes`
(id, closedAt, note + el snapshot de contadores) y la pantalla de
éxito lo muestra una sola vez. Pasado el momento, no hay endpoint
para revisar cierres anteriores — "¿qué cerré el martes?" solo se
responde consultando la base directa. La auditoría existe en la
tabla; falta exponerla.

## Qué falta

- `GET /admin/day-closes` con paginación (convención
  listados-paginacion-indices: page/limit + total del servidor +
  índice por `closed_at DESC` si el volumen lo amerita — la tabla
  crece una fila al día, sin índice extra por ahora).
- Response: lista de {id, closedAt, note, orderCount, totalAmount,
  cancelledCount, cancelledAmount} — el mismo shape del resumen
  del POST. ¿Detalle por cierre (`GET /admin/day-closes/:id` con
  el array `orders`)? Decidir en la propuesta.
- Consumidor natural: el historial definitivo de la app
  (pendiente app 014) podría agrupar pedidos por cierre.

## Criterio de cierre

- Endpoint documentado en `documentacion/api/admin/` con e2e;
  paginación verificada; el dueño lista sus cierres sin tocar SQL.
