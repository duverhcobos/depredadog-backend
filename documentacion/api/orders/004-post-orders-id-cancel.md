# POST /orders/:id/cancel

> Cancela un pedido propio **solo mientras está `pending`** — antes de
> que el local lo confirme. En la misma transacción el `payment`
> pendiente pasa a `failed`. Pedido ajeno responde **404**.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/orders/:id/cancel` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | — |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 015 |

## Request

### Path params
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | ID del pedido (400 si no es uuid válido) |

### Body (opcional)
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `reason` | string | no | `MaxLength(300)` | Por qué cancela — queda en `cancelReason` |

```json
{ "reason": "Ya no tengo hambre" }
```

Body vacío `{}` también es válido.

## Responses

### 201 — Cancelado
El pedido vuelve con `status: "cancelled"`, `cancelReason` lleno y
`payment.status: "failed"`.

```json
{
  "id": "4e7865f0-a78c-4596-aea8-a79d6976e437",
  "orderNumber": 2,
  "orderDate": "2026-11-07",
  "status": "cancelled",
  "serviceType": "delivery",
  "contactPhone": "3009876543",
  "deliveryAddress": "Casa blanca frente a la cancha (Barrio Centro)",
  "deliveryLocationLink": null,
  "subtotal": 14000,
  "deliveryFee": 2000,
  "discount": 0,
  "total": 16000,
  "notes": "Tocar el timbre dos veces",
  "cancelReason": "Ya no tengo hambre",
  "createdAt": "2026-11-07T14:18:13.390Z",
  "items": [
    {
      "id": "c6f28e5f-02cb-4635-bbfd-c1e38f4499ab",
      "productId": "212eec68-c171-45e8-84bc-2dd1099a43f8",
      "productName": "El Cachorro",
      "unitPrice": 14000,
      "quantity": 1,
      "lineTotal": 14000,
      "notes": null,
      "modifiers": [
        {
          "id": "869eff00-cad6-48ca-9c64-6bffecd26b7f",
          "optionId": "cc5b85d8-c365-4137-b27a-72204af9a133",
          "optionName": "Queso mozzarella",
          "action": "removed",
          "priceDelta": 0
        }
      ]
    }
  ],
  "payment": {
    "id": "d3e8d79e-7332-435d-9e06-27715ba9ede9",
    "method": "cash",
    "status": "failed",
    "amount": 16000,
    "payerPhone": null
  }
}
```

### 400 — `id` no es uuid o `reason` muy largo
`message` array con los errores de validación.

### 401 — Sin token o token inválido
```json
{ "message": "Unauthorized", "statusCode": 401, "timestamp": "..." }
```

### 404 — No existe o es de otro usuario
```json
{ "statusCode": 404, "message": "Order not found", "timestamp": "..." }
```

### 409 — Ya no está `pending`
Confirmado, en preparación, terminado o **ya cancelado** — re-cancelar
también responde 409.

```json
{ "statusCode": 409, "message": "Order can only be cancelled while pending", "timestamp": "..." }
```

## Notas

- **Cancelación atómica**: orden `cancelled` + payment `failed` en la
  misma transacción — no quedan pagos `pending` huérfanos.
- **Ventana de cancelación del cliente**: solo `pending`. Una vez el
  admin confirma, el pedido se atiende y ya no es cancelable por app
  (el flujo de refund manual queda fuera de este endpoint).
- Después de cancelar, el pedido pasa del bucket `active` a `history`
  en `GET /orders`.
