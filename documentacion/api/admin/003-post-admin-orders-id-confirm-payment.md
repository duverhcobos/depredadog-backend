# POST /admin/orders/:id/confirm-payment

> El dueño marca "me pagó" — cash en la entrega, la mesa o el
> mostrador (y transferencia verificada manualmente). Atómico e
> **idempotente**: un pago ya `paid` responde la orden tal cual sin
> error. Además de cobrar, el endpoint **avanza la orden en el mismo
> hecho** (§037.D) cuando el estado lo amerita.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/admin/orders/:id/confirm-payment` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | `admin` |
| **Rate limit** | global (100/min) |
| **Implementado** | propuestas 019 + 022 (§037.D) |

## Request

### Path params
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | Pedido cuyo pago se confirma |

Sin body.

### Efecto sobre el estado del pedido (§037.D)
| Estado actual | Canal / servicio | Resultado |
|---|---|---|
| `pending` | `presencial` + `pickup` | `payment→paid` **y** `status→confirmed` — la recogida sale de la bandeja al cobrarse |
| `ready` | cualquiera | `payment→paid` **y** `status→done` — el listo se entrega al cobrarse (mesa que paga y se va, domicilio cobrado en la puerta) |
| cualquier otro (`pending`/`confirmed`/`preparing` no presencial-pickup) | cualquiera | solo `payment→paid` — la orden no se mueve |

`pending` + `presencial` + `pickup` no se puede confirmar por PATCH
sin cobrar (409 `PAYMENT_NOT_SETTLED`) — este endpoint es el camino
autorizado.

## Responses

### 200 — Pago confirmado (o ya estaba `paid`)
`payment.status` pasa a `paid` y quedan registrados `confirmed_by`
(el admin del JWT) y `confirmed_at`. Si la orden avanzó, `status` y
`statusChangedAt` vienen actualizados. Responde la vista admin
completa del pedido.

```json
{
  "id": "4e7865f0-a78c-4596-aea8-a79d6976e437",
  "orderNumber": 2,
  "orderDate": "2026-11-07",
  "status": "done",
  "serviceType": "dine_in",
  "contactPhone": null,
  "deliveryAddress": null,
  "deliveryLocationLink": null,
  "subtotal": 28000,
  "deliveryFee": 0,
  "discount": 0,
  "appliedPromotions": [],
  "total": 28000,
  "notes": "Sin picante en uno",
  "cancelReason": null,
  "statusChangedAt": "2026-11-07T14:58:44.010Z",
  "createdAt": "2026-11-07T14:25:01.010Z",
  "items": [ { "id": "aa11bb22-02cb-4635-bbfd-333344445555", "productId": "212eec68-c171-45e8-84bc-2dd1099a43f8", "productName": "El Cachorro", "productSlug": "el-cachorro", "unitPrice": 14000, "quantity": 2, "lineTotal": 28000, "notes": null, "includedNames": ["Pan artesanal", "Salchicha americana"], "modifiers": [] } ],
  "payment": {
    "id": "ee66ff77-7332-435d-9e06-888899990000",
    "method": "cash",
    "status": "paid",
    "amount": 28000,
    "payerPhone": null,
    "provider": null,
    "providerReference": null
  },
  "channel": "presencial",
  "tableLabel": "Mesa 1",
  "customerName": null,
  "deliveryAddressLabel": null,
  "deliveryLandmark": null,
  "deliveryNeighborhood": null
}
```

### 401 — Sin token
### 403 — Rol ≠ `admin`

### 404 — Pedido inexistente
```json
{ "statusCode": 404, "errorCode": "ORDER_NOT_FOUND", "message": "Order not found", "timestamp": "..." }
```

### 409 — Pago no confirmable
```json
{ "statusCode": 409, "errorCode": "PAYMENT_NOT_CONFIRMABLE", "message": "Payment cannot be confirmed", "timestamp": "..." }
```

Casos: el pedido no tiene fila de pago, el pago quedó `failed`/
`refunded` (un `failed` no resucita — el flujo muerto es terminal), o
la carrera se perdió (otro resolvedor ganó el claim).

## Notas

- **Claim atómico** — el UPDATE condicional sobre
  `payments.status='pending'` es la puerta: doble tap del dueño o un
  webhook paralelo no duplica nada.
- **`paid` es idempotente por diseño** — confirmar de nuevo responde
  200 con la misma orden, sin otro write ni movimiento.
- **Carrera de transición tolerante** — si otro resolvedor movió la
  orden entre el claim del pago y la transición, el pago queda `paid`
  y la respuesta trae el estado real reléído (no un error).
- **`transfer` también se puede confirmar acá** si el cliente pagó por
  fuera del push y el dueño lo verificó manualmente — en el flujo
  normal del webhook el pago ya llega `paid` y este endpoint es no-op.
