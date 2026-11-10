# Pendiente: Flujo de reembolsos (`payments.status = 'refunded'`)

> **Estado: 🔴 PENDIENTE** — el enum lo soporta pero ningún flujo lo produce
> **Producto:** backend
> **Bloqueo:** no bloqueante para dev/MVP — se resuelve operando a mano; sí
> es requerido antes de producción con dinero real

## Contexto

Cuando una orden con pago ya `paid` se cancela (admin o un cancel tardío),
el pago queda `paid` sobre una orden `cancelled` — la plata se devuelve al
cliente por fuera del sistema (efectivo en mano o reverso Nequi) pero nada
lo registra. El modelo declara `refunded` + razón y `payments`
`refunded_by`/`refunded_at`/`refund_reason` ya existen en la tabla.

Casos reales:

- Admin cancela una orden `confirmed`/`done` ya cobrada → el cliente
  espera su plata.
- Webhook `approved` gana la carrera contra un cancel del cliente (orden
  `cancelled` + payment `paid` es alcanzable: el cancel no toca un `paid`).
- Reverso/anulación de Nequi (caso 5 de su certificación — pendiente 010).

## Qué falta

- `POST /admin/orders/:id/refund` (o `PATCH /admin/payments/:id/refund`):
  `paid → refunded` + `refunded_by` (admin del JWT) + `refunded_at` +
  `refund_reason` obligatorio. Claim condicional igual que
  `confirmPayment`. Debe rechazar `pending`/`failed`/`refunded` →
  `PAYMENT_NOT_REFUNDABLE` 409.
- Listado/cola de "pagos por reembolsar" (órdenes `cancelled` con
  payment `paid`) — una vista o un bucket admin para que ninguna plata
  quedada se pierda.
- Con Nequi real: el reverso se dispara por API — el endpoint debe llamar
  al gateway (`reverse`/reembolso del proveedor) antes de marcar
  `refunded`, igual que `initiatePush` en el create.
- Doc API correspondiente + e2e.

## Criterio de cierre

Una orden cancelada con dinero cobrado siempre deja el payment en un
estado honesto (`refunded` con razón y quién), y la cola admin muestra
los reembolsos pendientes — ninguna plata quedada invisible.
