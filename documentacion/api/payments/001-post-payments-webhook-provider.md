# POST /payments/webhook/:provider

> Webhook del proveedor de cobro por push: notifica el resultado y el
> servidor resuelve el pago del pedido en una sola transacción —
> `approved` → payment `paid` + orden `confirmed`
> (excepción §037.D: la **recogida presencial** queda en `pending`
> aunque el pago llegue — la bandeja es el aviso y el dueño la
> confirma a mano);
> `rejected`/`expired`/`cancelled` → payment `failed` + orden
> `cancelled`. **Idempotente**: un webhook repetido responde 200 sin
> tocar nada. Público (sin JWT) — la autenticación es el secreto
> compartido `x-webhook-secret`. En dev el proveedor es `sim`
> (SimulatedPaymentGateway); con las llaves QA de Nequi llega `nequi`.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/payments/webhook/:provider` |
| **Autenticación** | Pública — header `x-webhook-secret` obligado |
| **Rol requerido** | — |
| **Rate limit** | 30 req/min |
| **Implementado** | propuesta 018 |

## Request

### Path params
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `provider` | string | Proveedor que despachó el cobro (`sim` en dev, `nequi` en prod) |

### Headers
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| `x-webhook-secret` | sí | Secreto compartido (`PAYMENT_WEBHOOK_SECRET` del servidor) |
| `Content-Type` | sí | `application/json` |

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `reference` | string | sí | `IsString` | `provider_reference` devuelta al despachar el push (`sim-<uuid>` en dev) |
| `status` | string | sí | `approved` \| `rejected` \| `expired` \| `cancelled` | Resultado normalizado del cobro |
| `payload` | object | no | `IsObject` | Cuerpo crudo del proveedor — se guarda en `provider_payload` para auditoría |

```json
{
  "reference": "sim-9f1c2e3a-7b4d-4e2f-9a1b-2c3d4e5f6a7b",
  "status": "approved",
  "payload": { "raw": "respuesta del proveedor" }
}
```

## Responses

### 200 — Pago aprobado (orden confirmada)
```json
{
  "id": "c020fdae-30a8-4967-ad8b-5f1284f32494",
  "orderNumber": 1,
  "orderDate": "2026-11-10",
  "status": "confirmed",
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
  "statusChangedAt": "2026-11-10T14:19:55.020Z",
  "createdAt": "2026-11-10T14:18:13.334Z",
  "items": [],
  "payment": {
    "id": "097fa1b4-0dda-40a3-8522-365719e9c54e",
    "method": "transfer",
    "status": "paid",
    "amount": 16000,
    "payerPhone": "3001234567",
    "provider": "sim",
    "providerReference": "sim-9f1c2e3a-7b4d-4e2f-9a1b-2c3d4e5f6a7b"
  }
}
```
> `items` viaja `[]` — la transición no carga el detalle del pedido.

### 200 — Pago fallido (orden cancelada)
Mismo cuerpo con `"status": "cancelled"`, `payment.status: "failed"` y
`cancelReason` en español según el `status` recibido:
`"Pago rechazado por el proveedor"` (`rejected`) ·
`"El pago expiró sin aprobación"` (`expired`) ·
`"Pago cancelado por el proveedor"` (`cancelled`).

### 200 — Webhook repetido (idempotente)
Pago ya resuelto (`paid`/`failed`/`refunded`) → responde la orden tal
como está, sin revertir ni re-aplicar nada. Un `rejected` tardío sobre
un pago ya `paid` también es no-op.

### 400 — Validación o webhook no configurado
`message` array si falla el DTO (`status` fuera de la lista, `payload`
no objeto). Sin `PAYMENT_WEBHOOK_SECRET` configurado en el servidor:
```json
{ "message": "Webhook is not configured", "error": "Bad Request", "statusCode": 400, "timestamp": "..." }
```

### 401 — Secreto inválido o ausente
```json
{ "message": "Invalid webhook secret", "error": "Unauthorized", "statusCode": 401, "timestamp": "..." }
```

### 404 — Referencia desconocida
```json
{ "statusCode": 404, "errorCode": "PAYMENT_NOT_FOUND", "message": "Payment not found", "timestamp": "..." }
```

### 429 — Rate limit excedido
```json
{ "statusCode": 429, "message": "ThrottlerException: Too Many Requests", "timestamp": "..." }
```

## Notas

- **La referencia es la llave**: la resolución busca el payment por
  `(provider, provider_reference)` — el provider de la ruta debe ser el
  mismo con el que se despachó (`sim` ≠ `nequi` aunque la referencia
  coincida).
- **Quien gana el claim posee la transición**: la resolución es un
  UPDATE condicional `payments.status='pending'` — un solo resolvedor
  la gana. Si el cliente canceló antes de que llegue el `approved`,
  su cancel ya consumió el claim (`pending→failed`): el webhook
  responde 200 idempotente con la orden `cancelled` y el payment
  `failed` — jamás resucita ni se revierte. Una aprobación de dinero
  real posterior al cancel queda para reverso/reconciliación
  (pendiente 010).
- **`cancelReason` es user-facing**: las razones de cancelación por
  pago se escriben en español — la app las muestra tal cual en el
  historial.
- **Dev**: el push se "despacha" al crear la orden (`POST /orders` con
  `paymentMethod: "transfer"`) y este webhook se invoca a mano con la
  `providerReference` devuelta — mismo camino de código que tendrá el
  callback real de Nequi.
- **Secreto obligado en todo ambiente**: sin `PAYMENT_WEBHOOK_SECRET`
  el endpoint responde 400 siempre — la puerta queda cerrada si la
  provisión falla.
- **Precedencia validación → secreto**: un body malformado responde
  400 aunque el `x-webhook-secret` sea inválido (el ValidationPipe
  corre antes que el handler). Un atacante sin secreto puede
  distinguir "body válido" de "body inválido" pero jamás llega al
  use-case — aceptado en dev; con Nequi la firma se validará en un
  guard previo al pipe (pendiente 010).
- **Comparación constant-time**: el secreto se compara con
  `crypto.timingSafeEqual`, no con `!==`.
