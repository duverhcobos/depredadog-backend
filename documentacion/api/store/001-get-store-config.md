# GET /store/config

> Configuración del negocio para la app: nombre/dirección/logo, costo y
> mínimo de delivery, si está **abierto ahora** (derivado del horario y la
> timezone del negocio — nunca un flag manual), el horario de hoy y la
> semana completa. La usa el pill "Abierto" del header y el checkout.

| | |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/store/config` |
| **Autenticación** | Pública (propuesta 020) |
| **Rol requerido** | — |
| **Rate limit** | default global (100 req/min) |
| **Implementado** | propuesta 013 |
| **Integrado en app** | ⬜ pendiente |

## Request

Sin body ni query params.

## Responses

### 200 — Config del negocio

```json
{
  "name": "Depredadog",
  "phone": null,
  "address": "Cl. 7ª, Pueblo Nuevo, Arauquita, Arauca",
  "logoUrl": null,
  "deliveryFee": 2000,
  "minDeliveryOrder": 10000,
  "isOpen": true,
  "today": {
    "dayOfWeek": 2,
    "opensAt": "17:00",
    "closesAt": "23:00",
    "isClosed": false
  },
  "weeklyHours": [
    {
      "dayOfWeek": 0,
      "opensAt": "16:00",
      "closesAt": "23:00",
      "isClosed": false
    },
    {
      "dayOfWeek": 1,
      "opensAt": "00:00",
      "closesAt": "00:00",
      "isClosed": true
    },
    {
      "dayOfWeek": 2,
      "opensAt": "17:00",
      "closesAt": "23:00",
      "isClosed": false
    },
    {
      "dayOfWeek": 3,
      "opensAt": "17:00",
      "closesAt": "23:00",
      "isClosed": false
    },
    {
      "dayOfWeek": 4,
      "opensAt": "17:00",
      "closesAt": "23:00",
      "isClosed": false
    },
    {
      "dayOfWeek": 5,
      "opensAt": "17:00",
      "closesAt": "23:00",
      "isClosed": false
    },
    {
      "dayOfWeek": 6,
      "opensAt": "17:00",
      "closesAt": "23:00",
      "isClosed": false
    }
  ]
}
```

| Campo | Descripción |
|-------|-------------|
| `deliveryFee` | Costo fijo de envío en COP (snapshot que `orders` copiará al pedido). |
| `minDeliveryOrder` | Compra mínima para delivery en COP; `null` = sin mínimo. |
| `isOpen` | Derivado de `weeklyHours` + hora actual en la timezone del negocio (`STORE_TIMEZONE`, `America/Bogota`). Soporta rangos que cruzan medianoche (`closesAt <= opensAt`, ej. 17:00→02:00) — incluida la "cola" del rango de ayer. |
| `today` | La fila del día de hoy en la tz del negocio (para "Hoy cierra 23:00"); `null` si falta el día en `weeklyHours`. |
| `today.dayOfWeek` | `0`=domingo … `6`=sábado (convención JS `getDay()`). |
| `opensAt` / `closesAt` | `'HH:MM'` hora local del negocio. En días `isClosed=true` son valores centinela (`00:00`) — ignorarlos. |
| `weeklyHours` | Siempre las 7 filas ordenadas por `dayOfWeek`; `isClosed=true` = el local no abre ese día. |

### 404 — Negocio sin configurar

```json
{
  "statusCode": 404,
  "errorCode": "STORE_NOT_CONFIGURED",
  "message": "Store is not configured",
  "timestamp": "2026-11-05T22:00:00.000Z"
}
```

Sin fila en `store_settings` el negocio no está configurado — es fallo de
despliegue (falta el seed/config inicial), no del cliente. La app debe
mostrar su estado de error; **nunca** asumir "abierto" ni inventar un
default.

## Notas

- `isOpen` es frescura al momento de la llamada — la app debe refrescarlo
  al entrar al checkout y `orders` re-valida el horario al crear el
  pedido (el estado puede cambiar entre pantalla y confirmación).
- Valores del ejemplo = seed de desarrollo (placeholder que el dueño
  ajustará desde el futuro panel admin): fee $2.000, mínimo $10.000,
  lunes cerrado, mar–sáb 17–23, dom 16–23.
