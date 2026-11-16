# GET /admin/orders

> Cola del local — todos los pedidos sin filtro de cliente. `active`
> es el kanban de Cocina: los pedidos en curso (`pending` → `ready`)
> **más los `done` aún sin cerrar** (§022 — el entregado sigue en la
> cola hasta el cierre de caja). `history` = `cancelled` + `done`
> ya cerrados, paginado. Cada ítem es la vista del dueño: lo que ve
> el cliente + `channel`, `tableLabel`, `customerName` y el desglose
> de la dirección del domicilio.

| | |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/admin/orders` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | `admin` |
| **Rate limit** | global (100/min) |
| **Implementado** | propuestas 019 + 022 (+§037) |

## Request

### Query params
| Campo | Tipo | Default | Validación | Descripción |
|-------|------|---------|------------|-------------|
| `bucket` | string | `active` | `active` \| `history` | `active` = en curso + `done` sin cerrar; `history` = `cancelled` + `done` cerrados |
| `page` | int | `1` | `Min(1)` | Página (solo aplica a `history`) |
| `limit` | int | `20` | `Min(1)`, `Max(50)` | Tamaño de página (solo `history`) |

Sin `?bucket` equivale a `bucket=active`.

## Responses

### 200 — `bucket=active`
Pedidos vivos de CUALQUIER fecha y canal ordenados por
`statusChangedAt` ascendente (§037.A — cada carril del kanban ordena
por cuándo entró el pedido a su estado, no por `createdAt`: un
`done` recién entregado no salta al tope). `modifiers` viaja vacío
en el listado; el detalle completo sale por el PATCH/POST que
devuelve la misma forma.

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
      "statusChangedAt": "2026-11-07T14:18:13.390Z",
      "createdAt": "2026-11-07T14:18:13.390Z",
      "items": [
        {
          "id": "c6f28e5f-02cb-4635-bbfd-c1e38f4499ab",
          "productId": "212eec68-c171-45e8-84bc-2dd1099a43f8",
          "productName": "El Cachorro",
          "productSlug": "el-cachorro",
          "unitPrice": 14000,
          "quantity": 1,
          "lineTotal": 14000,
          "notes": null,
          "includedNames": ["Pan artesanal", "Salchicha americana"],
          "modifiers": []
        }
      ],
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
      "customerName": "Test User",
      "deliveryAddressLabel": "Casa",
      "deliveryLandmark": "Casa blanca frente a la cancha",
      "deliveryNeighborhood": "Barrio Centro"
    },
    {
      "id": "91b2c4d5-1111-4596-aea8-0000000000aa",
      "orderNumber": 3,
      "orderDate": "2026-11-07",
      "status": "done",
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
      "statusChangedAt": "2026-11-07T14:58:44.010Z",
      "createdAt": "2026-11-07T14:25:01.010Z",
      "items": [
        {
          "id": "aa11bb22-02cb-4635-bbfd-333344445555",
          "productId": "212eec68-c171-45e8-84bc-2dd1099a43f8",
          "productName": "El Cachorro",
          "productSlug": "el-cachorro",
          "unitPrice": 14000,
          "quantity": 2,
          "lineTotal": 28000,
          "notes": null,
          "includedNames": ["Pan artesanal", "Salchicha americana", "Queso mozzarella"],
          "modifiers": []
        }
      ],
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
  ],
  "total": 2,
  "page": 1,
  "limit": 20
}
```

- `channel`: `online` (lo pidió el cliente en la app) \| `presencial`
  (lo tomó el dueño en el local).
- `tableLabel`: etiqueta de la mesa (`dine_in`); `null` en
  `pickup`/`delivery` o si la mesa se desactivó después.
- `customerName`: `"Nombre Apellido"` del cliente registrado; `null`
  en pedidos presenciales (cliente sin cuenta).
- `statusChangedAt`: cuándo entró al estado actual — la app ordena
  cada carril del kanban por este campo.
- `deliveryAddressLabel` / `deliveryLandmark` / `deliveryNeighborhood`
  (§037.B): desglose de la dirección resuelto desde la ficha
  `addresses` del pedido. `null` en `pickup`/`dine_in` y en pedidos
  sin `addressId` (teléfono) — el fallback visual es el `deliveryAddress`
  crudo (snapshot `"landmark (neighborhood)"`).

### 200 — `bucket=history` (paginado)
`cancelled` (cualquier fecha) + `done` con cierre de caja, recientes
primero; `total` es el conteo real del bucket. History vacío →
`{ "items": [], "total": 0, "page": 1, "limit": 20 }`.

### 400 — Query inválida
`message` array (`bucket` fuera de `active|history`, `page`/`limit`
fuera de rango).

### 401 — Sin token o token inválido
```json
{ "message": "Unauthorized", "statusCode": 401, "timestamp": "..." }
```

### 403 — Autenticado pero rol ≠ `admin`
```json
{ "message": "Forbidden resource", "error": "Forbidden", "statusCode": 403, "timestamp": "..." }
```

## Notas

- **Sin filtro de cliente** — el dueño ve TODO: pedidos online y
  presenciales (estos con `customer_id` NULL aparecen igual).
- **`active` no pagina** — acotado por naturaleza; `page`/`limit` se
  ignoran ahí aunque el envelope los reporta.
- **`done` no sale solo** — queda en `active` (con `payment.paid`)
  hasta que `POST /admin/day-close` lo archive; entonces migra a
  `history`. `cancelled` es history desde el momento del cancel — el
  cierre solo lo estampa con su `day_close_id` para la auditoría.
- **`preparing`/`ready` son estados reales** desde §022 — la app los
  etiqueta por `serviceType` ("preparando" → "va en
  camino"/"servido"/"listo p/recoger").
- **`payment` puede ser `null`** en pedidos viejos sin fila de pago —
  consumir con null-check.
