# PATCH /addresses/:id

> Edición parcial de una dirección propia. Campo ausente = no tocar; en los
> campos **nullable** (`neighborhood`, `latitude`, `longitude`), `null`
> explícito LIMPIA el valor.

| | |
|---|---|
| **Método** | `PATCH` |
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

### Body — todos opcionales
| Campo | Tipo | Validación | Descripción |
|-------|------|------------|-------------|
| `label` | string | `IsNotEmpty`, `MaxLength(50)` | |
| `landmark` | string | `IsNotEmpty`, `MaxLength(255)` | |
| `neighborhood` | string \| `null` | `MaxLength(150)` | `null` quita el sector |
| `type` | string | `home` \| `work` \| `other` | |
| `latitude` | number \| `null` | `IsLatitude` | `null` limpia el pin |
| `longitude` | number \| `null` | `IsLongitude` | `null` limpia el pin |
| `isDefault` | boolean | — | `true` la marca única default |

```json
{
  "landmark": "Al lado de la panadería"
}
```

## Responses

### 200 — Actualizada
```json
{
  "id": "a6a03b7c-035b-4890-b801-51f29e29cc03",
  "label": "Trabajo",
  "landmark": "Al lado de la panadería",
  "neighborhood": null,
  "type": "work",
  "latitude": null,
  "longitude": null,
  "isDefault": false,
  "createdAt": "2026-11-07T13:00:05.367Z",
  "updatedAt": "2026-11-07T13:00:05.387Z"
}
```

### 400 — Validación o uuid malformado
`message` es array en errores de campos; `:id` no-uuid también es 400.
Campos extra en el body se rechazan (`forbidNonWhitelisted`).

### 401 — Sin token o token inválido
```json
{ "message": "Unauthorized", "statusCode": 401, "timestamp": "..." }
```

### 404 — No existe o no es del usuario
```json
{ "statusCode": 404, "errorCode": "ADDRESS_NOT_FOUND", "message": "Address not found", "timestamp": "..." }
```

## Notas

- El 404 es deliberado (no 403): una dirección ajena responde igual que una
  inexistente — no se revela que existe.
- `isDefault: false` sobre la default se permite — el usuario puede quedar
  sin default (el checkout cae a la primera de la lista).
