# POST /auth/refresh

> Rota el refresh token y emite un access token nuevo. El token presentado
> queda revocado.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/refresh` |
| **Autenticación** | Pública (usa el refresh token, no el access) |
| **Rol requerido** | — |
| **Rate limit** | 10 req/min |
| **Implementado** | propuesta 002 |

## Request

### Body
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `refreshToken` | string | sí | `IsNotEmpty` |

```json
{ "refreshToken": "X9v2..." }
```

## Responses

### 200 — Rotado
```json
{ "accessToken": "eyJhbGciOi...", "refreshToken": "Z1w3..." }
```

### 401 — Token inexistente, expirado o revocado
```json
{ "statusCode": 401, "message": "Invalid or expired session", "timestamp": "..." }
{ "statusCode": 401, "message": "Session expired, please log in again", "timestamp": "..." }
```

## Notas

- **Reuso de token revocado** = posible robo → se revocan TODAS las sesiones
  del usuario (segundo mensaje).
- El nuevo refresh token conserva el `device_id` de la sesión original.
