# POST /auth/reset-password

> Canjea el código de reset: cambia la contraseña, **mata todas las sesiones
> previas** y devuelve una sesión nueva.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/reset-password` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 5 req/min |
| **Implementado** | propuesta 003 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `email` | string | sí | `IsEmail` | |
| `code` | string | sí | `^\d{6}$` | Código del email de reset |
| `newPassword` | string | sí | `MinLength(8)` `MaxLength(72)` | |
| `deviceFingerprint` | string | no | `MaxLength(255)` | |
| `platform` | string | no | `android` \| `ios` | |

```json
{ "email": "ana@test.com", "code": "483920", "newPassword": "NuevaPass9" }
```

## Responses

### 200 — Password cambiada + sesión nueva
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "X9v2...",
  "user": { "id": "...", "email": "ana@test.com", "status": "active", "...": "..." }
}
```

### 400 — Código inválido/expirado/consumido
```json
{ "statusCode": 400, "errorCode": "INVALID_AUTH_CODE", "message": "Invalid or expired code", "timestamp": "..." }
```
Mismo mensaje para cualquier fallo del código — no revela qué falló.

## Notas

- Todas las `refresh_tokens` del usuario quedan revocadas (seguridad post-cambio
  de credencial) — los dispositivos previos deben hacer login de nuevo.
- El código es de un solo uso; el hash (no el plano) se persiste en
  `auth_tokens.token_hash`.
