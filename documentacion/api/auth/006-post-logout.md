# POST /auth/logout

> Revoca la sesión actual (la fila `refresh_tokens` ligada al access token).

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/logout` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | — |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 002 |

## Request

### Headers
| Header | Requerido |
|--------|-----------|
| `Authorization: Bearer <accessToken>` | sí |

Sin body.

## Responses

### 204 — Sesión revocada

### 401 — Sin token o token inválido

## Notas

- Después del logout, el `refreshToken` y `GET /auth/me` con ese access token
  dejan de funcionar.
- Es idempotente: logout sobre sesión ya revocada no falla.
