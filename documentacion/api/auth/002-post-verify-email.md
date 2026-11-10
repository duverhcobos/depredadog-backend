# POST /auth/verify-email

> Canjea el código de 6 dígitos enviado al email. Activa la cuenta y devuelve
> la sesión lista para usar.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/verify-email` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 5 req/min |
| **Implementado** | propuesta 002 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `email` | string | sí | `IsEmail` | |
| `code` | string | sí | 6 dígitos | Código del email de verificación |
| `deviceFingerprint` | string | no | `MaxLength(255)` | |
| `platform` | string | no | `android` \| `ios` | |

```json
{ "email": "ana@test.com", "code": "482910" }
```

## Responses

### 200 — Verificado
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "X9v2...",
  "user": { "id": "...", "email": "ana@test.com", "status": "active", "emailVerifiedAt": "2026-01-01T00:00:00.000Z", "referralCode": "XK2P9QRD", "...": "..." }
}
```

| Campo | Descripción |
|-------|-------------|
| `accessToken` | JWT 15 min — payload `{sub, sid, email, role}` |
| `refreshToken` | Token opaco 30 días, rotativo — solo para `POST /auth/refresh` |

### 400 — Código inválido, expirado, de otro usuario o ya consumido
```json
{ "statusCode": 400, "errorCode": "INVALID_AUTH_CODE", "message": "Invalid or expired code", "timestamp": "..." }
```

## Notas

- El código es single-use y ligado al email — no sirve el de otra cuenta.
- El código vence a los 15 min (configurable vía `AUTH_CODE_TTL_MINUTES`); `POST /auth/resend-verification` emite uno nuevo.
