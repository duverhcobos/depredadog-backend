# POST /orders

> Crea un pedido del cliente autenticado (canal `online`). El servidor
> **revalida el catálogo y cobra precios de la BD** — nunca del cliente.
> Idempotente por `clientRequestId`: un reintento responde la misma
> orden con el mismo `id` (también con 201).

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/orders` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | — |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 015 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `serviceType` | string | sí | `pickup` \| `delivery` | Cómo se consume el pedido |
| `items` | array | sí | `ArrayMinSize(1)` | Ítems del pedido (ver abajo) |
| `items[].productId` | uuid | sí | — | Producto de la carta |
| `items[].quantity` | int | sí | `Min(1)`, `Max(20)` | Cantidad |
| `items[].notes` | string | no | `MaxLength(200)` | Nota del ítem ("término medio") |
| `items[].modifiers` | array | sí (default `[]`) | — | Modificadores elegidos (ver abajo) |
| `items[].modifiers[].optionId` | uuid | sí | — | Opción de la carta |
| `items[].modifiers[].action` | string | sí | `added` \| `removed` | `added` extra / `removed` "sin X" |
| `items[].modifiers[].replacesOptionId` | uuid | no | — | Solo en `added` de reemplazo gratis: apunta al ingrediente incluido que reemplaza |
| `addressId` | uuid | delivery* | — | Dirección guardada propia. **XOR** con `newAddress` |
| `newAddress` | object | delivery* | — | `{ landmark, neighborhood? }` — dirección sin guardar. **XOR** con `addressId` |
| `contactPhone` | string | delivery | `/^3\d{9}$/` | Quién recibe el pedido (celular CO) |
| `deliveryLocationLink` | string | no | `MaxLength(500)` | Pin de Google adjunto al pedido |
| `paymentMethod` | string | sí | `cash` \| `transfer` | `cash` solo en `delivery`; `pickup` exige `transfer` |
| `payerPhone` | string | transfer | `/^3\d{9}$/` | Celular que recibe el push — prohibido en `cash` |
| `notes` | string | no | `MaxLength(500)` | Nota del pedido ("timbre roto") |
| `clientRequestId` | uuid | no | — | Idempotency key que genera la app por checkout |

### Ejemplo pickup + transferencia
```json
{
  "serviceType": "pickup",
  "items": [
    {
      "productId": "212eec68-c171-45e8-84bc-2dd1099a43f8",
      "quantity": 1,
      "modifiers": [
        { "optionId": "03ad6f96-8e46-4b3b-a931-bd91b0079cc7", "action": "added" }
      ]
    }
  ],
  "paymentMethod": "transfer",
  "payerPhone": "3001234567",
  "clientRequestId": "a20dc112-c2fe-49b4-b3fa-db7da27184c7"
}
```

### Ejemplo delivery + efectivo
```json
{
  "serviceType": "delivery",
  "items": [
    {
      "productId": "212eec68-c171-45e8-84bc-2dd1099a43f8",
      "quantity": 1,
      "modifiers": [
        { "optionId": "cc5b85d8-c365-4137-b27a-72204af9a133", "action": "removed" }
      ]
    }
  ],
  "addressId": "c2e091dd-4b64-4259-a602-efd9c07fae70",
  "contactPhone": "3009876543",
  "paymentMethod": "cash",
  "notes": "Tocar el timbre dos veces"
}
```

## Responses

### 201 — Pedido creado (pickup + transfer)
```json
{
  "id": "c020fdae-30a8-4967-ad8b-5f1284f32494",
  "orderNumber": 1,
  "orderDate": "2026-11-07",
  "status": "pending",
  "serviceType": "pickup",
  "contactPhone": null,
  "deliveryAddress": null,
  "deliveryLocationLink": null,
  "subtotal": 16000,
  "deliveryFee": 0,
  "discount": 0,
  "total": 16000,
  "notes": null,
  "cancelReason": null,
  "createdAt": "2026-11-07T14:18:13.334Z",
  "items": [
    {
      "id": "5b969156-8ae5-4350-8a41-d2e15b0a5f48",
      "productId": "212eec68-c171-45e8-84bc-2dd1099a43f8",
      "productName": "El Cachorro",
      "productSlug": "el-cachorro",
      "unitPrice": 16000,
      "quantity": 1,
      "lineTotal": 16000,
      "notes": null,
      "includedNames": ["Pan artesanal", "Salchicha americana", "Queso mozzarella"],
      "modifiers": [
        {
          "id": "ebf32cdf-8114-4851-a75a-59bafc90a2fb",
          "optionId": "03ad6f96-8e46-4b3b-a931-bd91b0079cc7",
          "optionName": "Tocineta",
          "action": "added",
          "priceDelta": 2000,
          "modifierGroup": "ingredients",
          "replacesOptionId": null
        }
      ]
    }
  ],
  "payment": {
    "id": "097fa1b4-0dda-40a3-8522-365719e9c54e",
    "method": "transfer",
    "status": "pending",
    "amount": 16000,
    "payerPhone": "3001234567"
  }
}
```

### 201 — Pedido creado (delivery + cash)
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
      "productSlug": "el-cachorro",
      "unitPrice": 14000,
      "quantity": 1,
      "lineTotal": 14000,
      "notes": null,
      "includedNames": ["Pan artesanal", "Salchicha americana"],
      "modifiers": [
        {
          "id": "869eff00-cad6-48ca-9c64-6bffecd26b7f",
          "optionId": "cc5b85d8-c365-4137-b27a-72204af9a133",
          "optionName": "Queso mozzarella",
          "action": "removed",
          "priceDelta": 0,
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
    "amount": 16000,
    "payerPhone": null
  }
}
```

### 400 — Combinación inválida
`message` es un string con la regla violada (o array de strings cuando
falla la validación de tipos del DTO — `forbidNonWhitelisted` activo):

```json
{ "statusCode": 400, "message": "Pickup orders must be paid by transfer", "timestamp": "..." }
```

Posibles `message` de combinación:
`"Pickup orders must be paid by transfer"` · `"contactPhone only applies
to delivery"` · `"payerPhone is required for transfer"` · `"payerPhone
only applies to transfer"` · `"contactPhone is required for delivery"` ·
`"delivery requires exactly one of addressId or newAddress"` · `"delivery
fields do not apply to pickup"`.

### 401 — Sin token o token inválido
```json
{ "message": "Unauthorized", "statusCode": 401, "timestamp": "..." }
```

### 404 — `addressId` inexistente o de otro usuario
```json
{ "statusCode": 404, "message": "Address not found", "timestamp": "..." }
```

### 409 — Rechazo de negocio
```json
{ "statusCode": 409, "message": "Order rejected by catalog: option 75b76acd-... not for product", "timestamp": "..." }
{ "statusCode": 409, "message": "Store is closed", "timestamp": "..." }
{ "statusCode": 409, "message": "Delivery orders require a minimum of 10000", "timestamp": "..." }
```

Prefijo `"Order rejected by catalog: "` + detalle: producto agotado,
ingrediente esencial agotado, `duplicate modifier`, opción ajena al
producto, `cannot be removed`, opción `unavailable`, `invalid free
replacement`.

## Notas

- **Precios del servidor**: `unitPrice`, `priceDelta`, `deliveryFee`,
  `subtotal` y `total` se calculan de la BD en el momento del POST —
  cualquier precio que mande el cliente se ignora.
- **`orderNumber`** es el consecutivo del día de negocio (tz del local)
  — "pedido #1", "pedido #2" del ticket. `orderDate` es ese día.
- **Idempotencia**: `clientRequestId` repetido responde la orden ya
  creada (mismo `id`, mismo `orderNumber`) — seguro ante doble-tap.
- **Reemplazo gratis** (`replacesOptionId`): el `added` sale con
  `priceDelta: 0` cuando el ingrediente reemplazado era incluido +
  reemplazable, el nuevo es elegible como reemplazo y el payload trae
  su `removed` en el mismo ítem.
- **Snapshot de dirección**: `deliveryAddress` guarda
  `"landmark (neighborhood)"` como texto — borrar la dirección después
  no altera el pedido. `deliveryLocationLink` viaja aparte.
- **`payment` nace `pending`** con `amount` = `total`. `provider` no
  se expone (queda NULL hasta la integración de pasarela).
- **Local cerrado**: fuera de `business_hours` responde 409
  `"Store is closed"` — el contrato se defiende solo.
