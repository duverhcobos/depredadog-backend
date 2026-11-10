# GET /admin/tables

> Mesas del local con su ocupación: `activeOrderNumber` es el
> consecutivo del pedido `dine_in` vivo en la mesa — `null` = libre.

| | |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/admin/tables` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | `admin` |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 019 |

## Request

Sin parámetros.

## Responses

### 200 — Mesas con ocupación
Ordenadas por `label`. Una mesa `isActive=false` viaja igual (el dueño
decide si la rehabilita); una mesa inactiva **no acepta** pedidos
`dine_in` nuevos (`TABLE_NOT_FOUND` al crear).

```json
{
  "items": [
    {
      "id": "5e11d000-0000-4000-8000-000000000001",
      "label": "Mesa 1",
      "isActive": true,
      "activeOrderNumber": 3
    },
    {
      "id": "5e11d000-0000-4000-8000-000000000002",
      "label": "Mesa 2",
      "isActive": true,
      "activeOrderNumber": null
    },
    {
      "id": "5e11d000-0000-4000-8000-000000000003",
      "label": "Mesa 3",
      "isActive": true,
      "activeOrderNumber": null
    },
    {
      "id": "5e11d000-0000-4000-8000-000000000004",
      "label": "Mesa 4",
      "isActive": true,
      "activeOrderNumber": null
    }
  ]
}
```

`activeOrderNumber` se libera cuando el pedido dine_in de la mesa pasa
a `done` o `cancelled`.

### 401 — Sin token
### 403 — Rol ≠ `admin`

## Notas

- **Ocupación = pedido vivo** — `status` en
  `pending`/`confirmed`/`preparing` con `service_type='dine_in'` y
  `table_id` asignado. El número es el consecutivo diario del ticket
  (el mismo que ve el cliente y la comanda).
- **Mesas read-only** — el catálogo lo siembra el seed (`Mesa 1`–`4`);
  el CRUD de mesas es trabajo futuro.
