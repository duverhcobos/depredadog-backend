# POST /auth/login

> Login con email + password. Devuelve la sesión completa.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/login` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 5 req/min |
| **Implementado** | propuesta 002 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `email` | string | sí | `IsEmail` | |
| `password` | string | sí | `IsNotEmpty` | |
| `deviceFingerprint` | string | no | `MaxLength(255)` | |
| `platform` | string | no | `android` \| `ios` | |

```json
{ "email": "ana@test.com", "password": "Password1!", "deviceFingerprint": "a1b2c3d4e5f6", "platform": "android" }
```

## Responses

### 200 — Sesión emitida
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "X9v2...",
  "user": { "id": "...", "email": "ana@test.com", "status": "active", "...": "..." }
}
```

### 401 — Credenciales inválidas
```json
{ "statusCode": 401, "errorCode": "INVALID_CREDENTIALS", "message": "Invalid credentials", "timestamp": "..." }
```
Mismo mensaje para email inexistente, password errado o cuenta solo-Google (anti-enumeración).

### 403 — Email no verificado / cuenta suspendida
```json
{ "statusCode": 403, "errorCode": "EMAIL_NOT_VERIFIED", "message": "Email is not verified", "timestamp": "..." }
{ "statusCode": 403, "errorCode": "USER_SUSPENDED", "message": "Account is suspended", "timestamp": "..." }
```

## Notas

- Con `deviceFingerprint` el dispositivo queda registrado y la sesión queda
  ligada a él (`refresh_tokens.device_id`).
