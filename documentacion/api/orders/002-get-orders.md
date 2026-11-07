# GET /orders

> Lista los pedidos del cliente autenticado en dos buckets:
> `active` (en curso, sin paginar) e `history` (terminados, paginados).
> Mismo envelope en ambos: `{ items, total, page, limit }`.

| | |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/orders` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | — |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 015 |

## Request

### Query params
| Campo | Tipo | Default | Validación | Descripción |
|-------|------|---------|------------|-------------|
| `bucket` | string | `active` | `active` \| `history` | `active` = `pending`/`confirmed`/`preparing`; `history` = `done`/`cancelled` |
| `page` | int | `1` | `Min(1)` | Página (solo aplica a `history`) |
| `limit` | int | `20` | `Min(1)`, `Max(50)` | Tamaño de página (solo `history`) |

Sin `?bucket` equivale a `bucket=active`.

## Responses

### 200 — `bucket=active`
Pedidos en curso, recientes primero. `modifiers` viaja vacío en el
listado (la card muestra ítems + chip de pago; el detalle los trae
completos).

```json
{
  "items": [
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
          "modifiers": []
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
  ],
  "total": 2,
  "page": 1,
  "limit": 20
}
```

### 200 — `bucket=history` (paginado)
Pedidos `done`/`cancelled`, recientes primero. `total` es el conteo
real del bucket — la app dibuja el paginador con él.

```json
{
  "items": [
    {
      "id": "c020fdae-30a8-4967-ad8b-5f1284f32494",
      "orderNumber": 1,
      "orderDate": "2026-11-07",
      "status": "cancelled",
      "serviceType": "pickup",
      "contactPhone": null,
      "deliveryAddress": null,
      "deliveryLocationLink": null,
      "subtotal": 16000,
      "deliveryFee": 0,
      "discount": 0,
      "total": 16000,
      "notes": null,
      "cancelReason": "Me equivoqué de dirección",
      "createdAt": "2026-11-07T14:18:13.334Z",
      "items": [
        {
          "id": "5b969156-8ae5-4350-8a41-d2e15b0a5f48",
          "productId": "212eec68-c171-45e8-84bc-2dd1099a43f8",
          "productName": "El Cachorro",
          "unitPrice": 16000,
          "quantity": 1,
          "lineTotal": 16000,
          "notes": null,
          "modifiers": []
        }
      ],
      "payment": {
        "id": "097fa1b4-0dda-40a3-8522-365719e9c54e",
        "method": "transfer",
        "status": "failed",
        "amount": 16000,
        "payerPhone": "3001234567"
      }
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

History vacío → `{ "items": [], "total": 0, "page": 1, "limit": 20 }`.

### 400 — Query inválida
`message` array (`bucket` fuera de `active|history`, `page`/`limit`
fuera de rango).

### 401 — Sin token o token inválido
```json
{ "message": "Unauthorized", "statusCode": 401, "timestamp": "..." }
```

## Notas

- **Solo los míos** — el filtro es el `userId` del JWT; no hay forma de
  pedir pedidos ajenos.
- **`active` no pagina** — está acotado por naturaleza (pedidos en
  curso); `page`/`limit` se ignoran ahí aunque el envelope los reporta.
- **`payment` puede ser `null`** en pedidos viejos sin fila de pago —
  consumir con null-check.
