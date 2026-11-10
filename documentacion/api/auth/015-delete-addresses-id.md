# DELETE /addresses/:id

> Borra una dirección propia — borrado real, sin soft delete. Si era la
> `default`, la más antigua restante la hereda en la misma transacción.

| | |
|---|---|
| **Método** | `DELETE` |
| **Ruta** | `/addresses/:id` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | — |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 014 |

## Request

### Params
| Param | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | Dirección propia — ajena o inexistente responde **404** |

### Headers
| Header | Requerido |
|--------|-----------|
| `Authorization: Bearer <accessToken>` | sí |

## Responses

### 204 — Borrada
Sin body.

### 400 — `:id` no es uuid

### 401 — Sin token o token inválido
```json
{ "message": "Unauthorized", "statusCode": 401, "timestamp": "..." }
```

### 404 — No existe o no es del usuario
```json
{ "statusCode": 404, "errorCode": "ADDRESS_NOT_FOUND", "message": "Address not found", "timestamp": "..." }
```

## Notas

- Las órdenes que la referenciaban conservan su `delivery_address`
  (snapshot inmutable) — `orders.address_id` queda `NULL`
  (`ON DELETE SET NULL`), el link solo era procedencia.
- El 404 es deliberado (anti-enumeración): una dirección ajena responde
  igual que una inexistente.
