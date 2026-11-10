# POST /auth/google

> Login/registro con `idToken` de Google Sign-In. Si el email es nuevo crea la
> cuenta directo en `active` (Google ya probó el correo); si existe la cuenta
> por email la vincula (`google_id`).

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/google` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 5 req/min |
| **Implementado** | propuesta 003 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `idToken` | string | sí | `MinLength(10)` `MaxLength(4096)` | Token emitido por Google Sign-In del cliente |
| `deviceFingerprint` | string | no | `MaxLength(255)` | |
| `platform` | string | no | `android` \| `ios` | |

```json
{ "idToken": "eyJhbGciOiJSUzI1NiIs...", "deviceFingerprint": "a1b2c3", "platform": "android" }
```

## Responses

### 200 — Sesión emitida
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "X9v2...",
  "user": { "id": "...", "email": "ana@gmail.com", "status": "active", "...": "..." }
}
```

### 401 — Token inválido
```json
{ "statusCode": 401, "errorCode": "INVALID_GOOGLE_TOKEN", "message": "Invalid Google token", "timestamp": "..." }
```
Incluye: firma/audiencia inválida, token expirado, `email_verified=false`, o
endpoint sin `GOOGLE_CLIENT_IDS` configurados.

### 403 — Cuenta suspendida
```json
{ "statusCode": 403, "errorCode": "USER_SUSPENDED", "message": "Account is suspended", "timestamp": "..." }
```

## Notas

- Requiere `GOOGLE_CLIENT_IDS` (comma-separated, por plataforma cliente) en el
  entorno — la verificación corre contra los JWKS de Google via `google-auth-library`.
- La cuenta creada por Google nace sin `password_hash` — puede crear una después
  por `forgot-password` + `reset-password` (acredita posesión del email).
- Si el email ya tenía cuenta `pending_verification`, queda `active`.
