# GET /auth/me

> Perfil del usuario autenticado. Exige sesión viva (la fila `refresh_tokens`
> del `sid` debe estar activa) — después de logout devuelve 401 aunque el
> access token no haya expirado.

| | |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/auth/me` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | — |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 002 |

## Request

### Headers
| Header | Requerido |
|--------|-----------|
| `Authorization: Bearer <accessToken>` | sí |

## Responses

### 200 — Perfil
```json
{
  "id": "3f8a0c1e-...",
  "email": "ana@test.com",
  "firstName": "Ana",
  "secondName": "María",
  "firstLastName": "López",
  "secondLastName": "García",
  "phone": null,
  "role": "customer",
  "status": "active",
  "emailVerifiedAt": "2026-01-01T00:00:00.000Z",
  "referralCode": "XK2P9QRD",
  "marketingOptIn": false,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### 401 — Sin token, token inválido o sesión muerta
```json
{ "statusCode": 401, "errorCode": "SESSION_NOT_FOUND", "message": "Session is no longer valid", "timestamp": "..." }
```
El 401 del guard (sin token o firma inválida) sale sin `errorCode`: `{ "statusCode": 401, "message": "Unauthorized", "timestamp": "..." }`.
