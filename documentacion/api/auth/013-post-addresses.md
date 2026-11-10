# POST /addresses

> Crea una dirección guardada del usuario autenticado. La **primera** queda
> `isDefault: true` automática; marcar otra como default limpia las demás en
> la misma transacción.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/addresses` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | — |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 014 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `label` | string | sí | `IsNotEmpty`, `MaxLength(50)` | Etiqueta final del cliente ("Casa", "casa de mi mamá") |
| `landmark` | string | sí | `IsNotEmpty`, `MaxLength(255)` | Punto de referencia — ES la dirección |
| `neighborhood` | string | no | `MaxLength(150)` | Barrio/vereda/sector |
| `type` | string | sí | `home` \| `work` \| `other` | Clase de la ubicación — ícono en la app |
| `latitude` | number | no | `IsLatitude` | Pin de Google |
| `longitude` | number | no | `IsLongitude` | Pin de Google |
| `isDefault` | boolean | no | — | `true` la marca única default |

```json
{
  "label": "Casa",
  "landmark": "Casa blanca frente a la cancha",
  "neighborhood": "Barrio Centro",
  "type": "home",
  "latitude": 7.09,
  "longitude": -71.72
}
```

## Responses

### 201 — Creada
```json
{
  "id": "07e4d24d-d70d-4bb6-95f9-1b894cf1c3ca",
  "label": "Casa",
  "landmark": "Casa blanca frente a la cancha",
  "neighborhood": "Barrio Centro",
  "type": "home",
  "latitude": 7.09,
  "longitude": -71.72,
  "isDefault": true,
  "createdAt": "2026-11-07T12:58:46.313Z",
  "updatedAt": "2026-11-07T12:58:46.313Z"
}
```

### 400 — Validación
`message` es array con un string por regla violada. Campos extra en el body
se rechazan (`forbidNonWhitelisted`).

### 401 — Sin token o token inválido
```json
{ "message": "Unauthorized", "statusCode": 401, "timestamp": "..." }
```

### 409 — Límite alcanzado
```json
{ "statusCode": 409, "errorCode": "ADDRESS_LIMIT_REACHED", "message": "Address limit reached (10 per user)", "timestamp": "..." }
```

## Notas

- `label`, `landmark` y `neighborhood` se trimean; `neighborhood` vacío
  queda `null`.
- Máximo **10 direcciones por usuario** → la 11ª responde 409.
