# POST /admin/orders/:id/confirm-payment

> El dueño marca "me pagó" — cash en la entrega o la mesa (y
> transferencia verificada manualmente). Atómico e **idempotente**:
> un pago ya `paid` responde la orden tal cual sin error.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/admin/orders/:id/confirm-payment` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | `admin` |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 019 |

## Request

### Path params
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | Pedido cuyo pago se confirma |

Sin body.

## Responses

### 200 — Pago confirmado (o ya estaba `paid`)
`payment.status` pasa a `paid` y quedan registrados `confirmed_by`
(el admin del JWT) y `confirmed_at`. Responde la vista admin completa
del pedido — con el pago ya resuelto un `PATCH .../status {to:'done'}`
posterior ya no da `PAYMENT_NOT_SETTLED`.

```json
{
  "id": "4e7865f0-a78c-4596-aea8-a79d6976e437",
  "orderNumber": 2,
  "orderDate": "2026-11-07",
  "status": "confirmed",
  "serviceType": "dine_in",
  "contactPhone": null,
  "deliveryAddress": null,
  "deliveryLocationLink": null,
  "subtotal": 28000,
  "deliveryFee": 0,
  "discount": 0,
  "total": 28000,
  "notes": "Sin picante en uno",
  "cancelReason": null,
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
  "customerName": null
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
  200 con la misma orden, no un error.
- **`transfer` también se puede confirmar acá** si el cliente pagó por
  fuera del push y el dueño lo verificó manualmente — en el flujo
  normal del webhook el pago ya llega `paid` y este endpoint es no-op.
