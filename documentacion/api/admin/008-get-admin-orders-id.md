# GET /admin/orders/:id

> Detalle del dueño — la comanda completa. El listado manda
> `items[].modifiers: []` a propósito (payload liviano del kanban);
> este endpoint es el que viaja con los modifiers poblados ("sin
> cebolla" es instrucción de cocina, no decoración). Mismo agregado
> que `GET /orders/:id` pero sin filtro de cliente: el dueño ve
> cualquier orden, online o presencial.

| | |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/admin/orders/:id` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | `admin` |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 023 |

## Request

### Path params
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | ID del pedido (400 si no es uuid válido) |

## Responses

### 200 — Detalle
Misma forma de un ítem del [listado](001-get-admin-orders.md)
(`channel`, `tableLabel`, `customerName` y el desglose de la
dirección §037.B incluidos) pero con `items[].modifiers` poblado.

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
  "subtotal": 16000,
  "deliveryFee": 2000,
  "discount": 0,
  "appliedPromotions": [],
  "total": 18000,
  "notes": "Tocar el timbre dos veces",
  "cancelReason": null,
  "statusChangedAt": "2026-11-07T14:18:13.390Z",
  "createdAt": "2026-11-07T14:18:13.390Z",
  "items": [
    {
      "id": "c6f28e5f-02cb-4635-bbfd-c1e38f4499ab",
      "productId": "212eec68-c171-45e8-84bc-2dd1099a43f8",
      "productName": "El Cachorro",
      "productSlug": "el-cachorro",
      "unitPrice": 16000,
      "quantity": 1,
      "lineTotal": 16000,
      "notes": null,
      "includedNames": ["Pan artesanal", "Salchicha americana"],
      "modifiers": [
        {
          "id": "869eff00-cad6-48ca-9c64-6bffecd26b7f",
          "optionId": "cc5b85d8-c365-4137-b27a-72204af9a133",
          "optionName": "Queso mozzarella",
          "action": "removed",
          "priceDelta": 0,
          "times": 1,
          "modifierGroup": "ingredients",
          "replacesOptionId": null
        },
        {
          "id": "9a1b2c3d-4e5f-46a7-b8c9-d0e1f2a3b4c5",
          "optionId": "dd6c96e9-d476-5248-c33b-83315bf0b244",
          "optionName": "Tocineta",
          "action": "added",
          "priceDelta": 2000,
          "times": 1,
          "modifierGroup": "ingredients",
          "replacesOptionId": null
        }
      ]
    }
  ],
  "payment": {
    "id": "d3e8d79e-7332-435d-9e06-27715ba9ede9",
    "method": "cash",
    "status": "pending",
    "amount": 18000,
    "payerPhone": null,
    "provider": null,
    "providerReference": null
  },
  "channel": "online",
  "tableLabel": null,
  "customerName": "Test User",
  "deliveryAddressLabel": "Casa",
  "deliveryLandmark": "Casa blanca frente a la cancha",
  "deliveryNeighborhood": "Barrio Centro"
}
```

### 400 — `id` no es uuid
`message` array con el error de `ParseUUIDPipe`.

### 401 — Sin token o token inválido
```json
{ "message": "Unauthorized", "statusCode": 401, "timestamp": "..." }
```

### 403 — Autenticado pero rol ≠ `admin`
```json
{ "message": "Forbidden resource", "error": "Forbidden", "statusCode": 403, "timestamp": "..." }
```

### 404 — No existe
```json
{ "statusCode": 404, "errorCode": "ORDER_NOT_FOUND", "message": "Order not found", "timestamp": "..." }
```

## Notas

- **Úsese al abrir el detalle** — el listado es para las cards del
  kanban; este endpoint es el que trae la comanda completa.
- **`modifiers` acciones**: `added` con `priceDelta` cobrado (o 0 si
  fue reemplazo gratis — `replacesOptionId` apunta a la opción
  financiadora) y `removed` con delta 0. `times` (§026) son las
  porciones del adicional — `priceDelta` ya es el total de línea
  (`extra × times`), la comanda pinta "Tocineta ×2" con él.
  `modifierGroup` es el slug del grupo ("ingredients") para seccionar
  la personalización.
- **Desglose de dirección** (`deliveryAddressLabel` /
  `deliveryLandmark` / `deliveryNeighborhood`) resuelve igual que en
  el listado (§037.B): `null` en `pickup`/`dine_in` y pedidos sin
  `addressId` — el fallback visual es el `deliveryAddress` crudo.
- **`payment` puede ser `null`** en pedidos viejos sin fila de pago —
  consumir con null-check.
