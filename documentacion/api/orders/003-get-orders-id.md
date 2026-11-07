# GET /orders/:id

> Detalle completo de un pedido propio — incluye `modifiers` de cada
> ítem (a diferencia del listado). Pedido ajeno responde **404 igual
> que uno inexistente** (IDOR: no se revela que existe).

| | |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/orders/:id` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | — |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 015 |

## Request

### Path params
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | ID del pedido (400 si no es uuid válido) |

## Responses

### 200 — Pedido propio
```json
{
  "id": "4e7865f0-a78c-4596-aea8-a79d6976e437",
  "orderNumber": 2,
  "orderDate": "2026-11-07",
  "status": "pending",
  "serviceType": "delivery",
  "contactPhone": "3009876543",
  "deliveryAddress": "Casa blanca frente a la cancha (Barrio Centro)",
  "deliveryLocationLink": null,
  "subtotal": 14000,
  "deliveryFee": 2000,
  "discount": 0,
  "total": 16000,
  "notes": "Tocar el timbre dos veces",
  "cancelReason": null,
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
    "status": "pending",
    "amount": 16000,
    "payerPhone": null
  }
}
```

### 400 — `id` no es uuid
`message` array con el error de `ParseUUIDPipe`.

### 401 — Sin token o token inválido
```json
{ "message": "Unauthorized", "statusCode": 401, "timestamp": "..." }
```

### 404 — No existe o es de otro usuario
```json
{ "statusCode": 404, "message": "Order not found", "timestamp": "..." }
```

## Notas

- **`items[].modifiers` completo** acá — el listado los omite a
  propósito (`[]`); la pantalla de detalle usa este endpoint.
- `deliveryAddress`/`deliveryLocationLink` son snapshots inmutables —
  si el cliente borra la dirección guardada, el pedido la conserva.
