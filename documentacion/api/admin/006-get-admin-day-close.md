# GET /admin/day-close

> **Preview de solo lectura** del cierre de caja (§022): refleja
> exactamente lo que `POST /admin/day-close` archivaría en este
> momento — los pedidos terminales (`done` + `cancelled`) aún sin
> cerrar. No escribe nada; la app lo usa para mostrar el resumen
> antes de confirmar.

| | |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/admin/day-close` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | `admin` |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 022 |

## Request

Sin body ni params.

## Responses

### 200 — Snapshot del cierre potencial
Solo los `done` suman al total y al desglose por método (done ⇒ paid
— el invariante de transición lo garantiza; `paymentMethod` sale del
`method` del pago, `'unknown'` si no hubiera fila). Los `cancelled`
cuentan aparte como contexto del periodo — **no suman** al total.

```json
{
  "orderCount": 2,
  "totalAmount": 44000,
  "byMethod": [
    { "method": "cash", "count": 1, "amount": 28000 },
    { "method": "transfer", "count": 1, "amount": 16000 }
  ],
  "cancelledCount": 1,
  "cancelledAmount": 16000,
  "orders": [
    {
      "id": "91b2c4d5-1111-4596-aea8-0000000000aa",
      "orderNumber": 3,
      "total": 28000,
      "paymentMethod": "cash"
    },
    {
      "id": "4e7865f0-a78c-4596-aea8-a79d6976e437",
      "orderNumber": 5,
      "total": 16000,
      "paymentMethod": "transfer"
    }
  ]
}
```

Sin nada pendiente de cierre → todos los campos en cero y `orders: []`.

### 401 — Sin token o token inválido
```json
{ "message": "Unauthorized", "statusCode": 401, "timestamp": "..." }
```

### 403 — Autenticado pero rol ≠ `admin`
```json
{ "message": "Forbidden resource", "error": "Forbidden", "statusCode": 403, "timestamp": "..." }
```

## Notas

- **Solo lectura** — el preview lee los terminales sin `day_close_id`;
  un pedido que termina entre el preview y el POST simplemente entra
  en el cierre (el claim del POST es atómico).
- **`orders` trae los `done`** (id, orderNumber, total,
  paymentMethod) — la app puede listar el detalle del día; los
  cancelados solo aparecen en los contadores.
- **Es un instante, no un rango de fechas** — "el día" lo define el
  cierre anterior: todo lo terminal y no cerrado pertenece a este
  periodo, venga de hoy o de días sin cerrar.
