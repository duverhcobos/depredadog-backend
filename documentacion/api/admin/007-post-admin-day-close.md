# POST /admin/day-close

> Ejecuta el **cierre de caja manual** del día (§022): en una sola
> transacción crea el registro de auditoría, reclama TODOS los
> pedidos terminales sin cerrar (`done` + `cancelled` — les estampa
> el `day_close_id`) y persiste el snapshot financiero. Después del
> cierre, los `done` cerrados migran de la cola `active` a `history`.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/admin/day-close` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | `admin` |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 022 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `note` | string | no | `MaxLength(500)` | Nota del cierre ("cierre lento por la lluvia") |

```json
{ "note": "Cierre de lunes" }
```

## Responses

### 201 — Cierre persistido
El registro quedó con `closed_by` = el admin del JWT y `closed_at` =
ahora; los terminales reclamados apuntan a su `id`. Cuerpo = el
mismo snapshot del preview + `id`, `closedAt`, `note`.

```json
{
  "id": "7f3c9a12-4b5e-4f7a-9c1d-2e8f0a1b2c3d",
  "closedAt": "2026-11-08T04:30:12.441Z",
  "note": "Cierre de lunes",
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

### 400 — Body inválido
`note` > 500 chars o campos extra (`forbidNonWhitelisted`) →
`message` array.

### 401 — Sin token
### 403 — Rol ≠ `admin`

## Notas

- **Cierre vacío permitido** — sin terminales pendientes persiste un
  registro en ceros (bitácora del día sin movimiento). Un doble-tap
  crea un segundo cierre vacío: comportamiento aceptado — la app lo
  previene con el estado `busy` del botón.
- **Atómico** — el `UPDATE ... WHERE day_close_id IS NULL` reclama
  dentro de la misma transacción; un pedido que termina o un segundo
  POST concurrente no se cuela: el que pierde cierra lo que quedó
  (posiblemente nada → cierre vacío).
- **Los `cancelled` también se estampan** — su bucket ya era `history`
  por status, pero quedan atribuidos al periodo del cierre para la
  auditoría (`cancelledCount`/`cancelledAmount`).
- **No hay listado histórico de cierres** — el registro existe para
  auditoría en BD (`day_closes`); el consumo inmediato es esta
  respuesta.
