# GET /addresses

> Lista las direcciones guardadas del usuario autenticado — la `default`
> primero, luego por antigüedad (`created_at` ASC). Sin paginación: la lista
> está acotada a 10 por la regla de negocio (propuesta 014).

| | |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/addresses` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | — |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 014 |

## Request

### Headers
| Header | Requerido |
|--------|-----------|
| `Authorization: Bearer <accessToken>` | sí |

## Responses

### 200 — Mis direcciones
```json
[
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
  },
  {
    "id": "794049e8-4812-4c5e-b214-e7efd4a4fb2a",
    "label": "Trabajo",
    "landmark": "Oficina del centro",
    "neighborhood": null,
    "type": "work",
    "latitude": null,
    "longitude": null,
    "isDefault": false,
    "createdAt": "2026-11-07T12:58:46.321Z",
    "updatedAt": "2026-11-07T12:58:46.321Z"
  }
]
```

| Campo | Descripción |
|-------|-------------|
| `landmark` | Punto de referencia — ES la dirección (la zona no tiene nomenclatura de calles) |
| `neighborhood` | Barrio/vereda/sector — `null` si no se declaró |
| `type` | `home` \| `work` \| `other` — ícono en la app |
| `latitude` / `longitude` | Pin de Google opcional — `null` si no se guardó |
| `isDefault` | Preselección del checkout — máx. una por usuario |

Sin direcciones: `[]`.

### 401 — Sin token o token inválido
```json
{ "message": "Unauthorized", "statusCode": 401, "timestamp": "..." }
```
