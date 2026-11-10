# PATCH /admin/orders/:id/status

> Mueve el pedido por la matriz del flujo corto:
> `pending → confirmed → done`, con `cancelled` disponible desde
> `pending`/`confirmed`. `done` exige el pago ya `paid` — **no se
> entrega sin cobrar**.

| | |
|---|---|
| **Método** | `PATCH` |
| **Ruta** | `/admin/orders/:id/status` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | `admin` |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 019 |

## Request

### Path params
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | Pedido a mover |

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `to` | string | sí | `confirmed` \| `done` \| `cancelled` | Estado destino — `preparing` **no existe en el contrato** (400) |
| `cancelReason` | string | no | `MaxLength(300)` | Solo con `to='cancelled'` — razón user-facing en español |

```json
{ "to": "confirmed" }
```
```json
{ "to": "cancelled", "cancelReason": "Se acabó la salchicha" }
```

### Matriz de transiciones
| Desde \ Hacia | `confirmed` | `done` | `cancelled` |
|---|---|---|---|
| `pending` | ✅ | 409¹ | ✅ |
| `confirmed` | — | ✅² | ✅ |
| `done` | — | — | — (terminal) |
| `cancelled` | — | — | — (terminal) |

¹ Salto prohibido (`pending`→`done` directo es 409 `INVALID_STATUS_TRANSITION`).
² Solo si `payment.status='paid'` — si no, 409 `PAYMENT_NOT_SETTLED`
(primero `POST /admin/orders/:id/confirm-payment` en cash, o el
webhook en transfer).

## Responses

### 200 — Pedido movido
Misma vista admin del pedido (completa, con `channel`/`tableLabel`/
`customerName`).

```json
{
  "id": "4e7865f0-a78c-4596-aea8-a79d6976e437",
  "orderNumber": 2,
  "orderDate": "2026-11-07",
  "status": "confirmed",
  "serviceType": "delivery",
  "contactPhone": "3009876543",
  "deliveryAddress": "Casa blanca frente a la cancha (Barrio Centro)",
  "deliveryLocationLink": null,
  "subtotal": 14000,
  "deliveryFee": 2000,
  "discount": 0,
  "total": 16000,
  "notes": null,
  "cancelReason": null,
  "createdAt": "2026-11-07T14:18:13.390Z",
  "items": [ { "id": "c6f28e5f-02cb-4635-bbfd-c1e38f4499ab", "productId": "212eec68-c171-45e8-84bc-2dd1099a43f8", "productName": "El Cachorro", "productSlug": "el-cachorro", "unitPrice": 14000, "quantity": 1, "lineTotal": 14000, "notes": null, "includedNames": ["Pan artesanal", "Salchicha americana"], "modifiers": [] } ],
  "payment": {
    "id": "d3e8d79e-7332-435d-9e06-27715ba9ede9",
    "method": "cash",
    "status": "pending",
    "amount": 16000,
    "payerPhone": null,
    "provider": null,
    "providerReference": null
  },
  "channel": "online",
  "tableLabel": null,
  "customerName": "Test User"
}
```

### 400 — Body inválido
`to` fuera de `confirmed|done|cancelled` (incluye `preparing`) o
`cancelReason` > 300 chars → `message` array.

### 401 — Sin token
### 403 — Rol ≠ `admin`

### 404 — Pedido inexistente
```json
{ "statusCode": 404, "errorCode": "ORDER_NOT_FOUND", "message": "Order not found", "timestamp": "..." }
```

### 409 — Transición inválida / pago sin liquidar
```json
{ "statusCode": 409, "errorCode": "INVALID_STATUS_TRANSITION", "message": "Order cannot move to that status", "timestamp": "..." }
{ "statusCode": 409, "errorCode": "PAYMENT_NOT_SETTLED", "message": "Order payment is not settled", "timestamp": "..." }
```

`INVALID_STATUS_TRANSITION` cubre dos casos: `to` fuera de la matriz
para el estado actual, y la carrera perdida (otro write — webhook de
pago o doble tap — movió la orden entre la lectura y el UPDATE
condicional).

## Notas

- **Cancel mata el pago pendiente** — con `to='cancelled'`, un
  `payment.status='pending'` pasa a `failed` en la misma transacción
  (sin huérfanos de push Nequi). Un `paid` **no se toca**: el
  reembolso se resuelve manual fuera del sistema.
- **`preparing` es inalcanzable** — el enum lo conserva como reserva
  (cocina dedicada futura); el DTO lo rechaza con 400 y la matriz no
  lo produce.
- **`cancelReason` viaja al cliente** — la app lo muestra en el
  detalle del historial; escribir en español.
