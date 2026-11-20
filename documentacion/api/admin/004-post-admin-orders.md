# POST /admin/orders

> Pedido **presencial** que toma el dueño en el local — `dine_in` con
> mesa o `pickup` mostrador. `dine_in` nace `confirmed` (el local lo
> crea ya aceptado); `pickup` nace **`pending`** (§037.D — el cliente
> tarda en pagar en el mostrador y la bandeja es el aviso; el cobro lo
> confirma). Sin cliente ni dirección, con la misma revalidación de
> catálogo y precios de BD que el canal online.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/admin/orders` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | `admin` |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 019 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `serviceType` | string | sí | `dine_in` \| `pickup` | `dine_in` consume en mesa; `pickup` se lo lleva |
| `tableId` | uuid | `dine_in` | — | Mesa asignada — **prohibido** en `pickup` |
| `items` | array | sí | `ArrayMinSize(1)` | Ítems (misma forma que `POST /orders`) |
| `items[].productId` | uuid | sí | — | Producto de la carta |
| `items[].quantity` | int | sí | `Min(1)`, `Max(20)` | Cantidad |
| `items[].notes` | string | no | `MaxLength(200)` | Nota del ítem |
| `items[].modifiers` | array | sí (default `[]`) | — | `optionId` + `added`\|`removed` (+`times` §026, +`replacesOptionId`) |
| `paymentMethod` | string | sí | `cash` \| `transfer` | `cash` queda `pending` al cobro manual |
| `payerPhone` | string | `transfer` | `/^3\d{9}$/` | Celular que recibe el push — prohibido en `cash` |
| `notes` | string | no | `MaxLength(500)` | Nota del pedido |

### Ejemplo dine_in + cash
```json
{
  "serviceType": "dine_in",
  "tableId": "5e11d000-0000-4000-8000-000000000001",
  "items": [
    { "productId": "212eec68-c171-45e8-84bc-2dd1099a43f8", "quantity": 2, "modifiers": [] }
  ],
  "paymentMethod": "cash",
  "notes": "Sin picante en uno"
}
```

### Ejemplo pickup + transfer
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
  "payerPhone": "3001234567"
}
```

## Responses

### 201 — Pedido presencial creado
`status='confirmed'` en `dine_in` / `status='pending'` en `pickup`,
`channel='presencial'`, con `tableLabel` resuelto y
`customerName=null` (el comensal no tiene cuenta). El
`orderNumber` comparte el consecutivo diario con los pedidos online.

```json
{
  "id": "91b2c4d5-1111-4596-aea8-0000000000aa",
  "orderNumber": 3,
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
  "statusChangedAt": "2026-11-07T14:25:01.010Z",
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
    "status": "pending",
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

### 400 — Combinación inválida
```json
{ "statusCode": 400, "errorCode": "INVALID_ORDER_DATA", "message": "tableId is required for dine_in", "timestamp": "..." }
```

Posibles `message` de combinación: `"tableId is required for dine_in"`
· `"tableId only applies to dine_in"` · `"payerPhone is required for
transfer"` · `"payerPhone only applies to transfer"`.

### 401 — Sin token
### 403 — Rol ≠ `admin`

### 404 — Mesa inexistente o inactiva
```json
{ "statusCode": 404, "errorCode": "TABLE_NOT_FOUND", "message": "Table not found", "timestamp": "..." }
```

### 409 — Rechazo de catálogo
```json
{ "statusCode": 409, "errorCode": "ORDER_CATALOG_VIOLATION", "message": "Order rejected by catalog: product ... unavailable", "timestamp": "..." }
```

Misma revalidación que `POST /orders` (producto agotado, opción
ajena, removed de no-removible, reemplazo inválido…). **No aplica**
horario de atención ni mínimo de delivery — son reglas del canal
online; el local atiende en persona.

### 502 — El cobro `transfer` no se pudo despachar
```json
{ "statusCode": 502, "errorCode": "PAYMENT_DISPATCH_FAILED", "message": "Payment could not be dispatched", "timestamp": "..." }
```

## Notas

- **`dine_in` nace `confirmed`** — no hay "esperando confirmación del
  local": el dueño ya está parado en el local tomando el pedido.
- **`pickup` nace `pending`** (§037.D) — la bandeja es el aviso hasta
  que el cliente pague en el mostrador; `POST .../confirm-payment`
  cobra Y lo confirma en el mismo hecho (un `PATCH {to:'confirmed'}`
  sin pago responde 409 `PAYMENT_NOT_SETTLED`).
- **`deliveryFee=0` siempre** — presencial no cobra domicilio.
- **Mesa ocupada** — un `dine_in` vivo deja la mesa con
  `activeOrderNumber` en `GET /admin/tables` hasta que el pedido
  termine (`done`/`cancelled`).
- **Sin `clientRequestId`** — la idempotencia de reintento es
  preocupación del canal online; el dueño ve la comanda al momento.
- **`taken_by`** queda registrado con el `userId` del admin del JWT
  (auditoría interna — no viaja en la respuesta).
