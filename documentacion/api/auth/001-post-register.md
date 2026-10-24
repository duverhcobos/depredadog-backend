# POST /auth/register

> Registra un cliente nuevo. Queda `pending_verification` — la sesión se obtiene
> en `POST /auth/verify-email` con el código de 6 dígitos enviado al email.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/register` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 3 req/min |
| **Implementado** | propuesta 002 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `email` | string | sí | `IsEmail` | Único, case-insensitive |
| `password` | string | sí | `MinLength(8)`, `MaxLength(72)` | Se guarda con bcrypt |
| `firstName` | string | sí | `Length(1,100)` | |
| `lastName` | string | no | `MaxLength(100)` | |
| `phone` | string | no | `MaxLength(20)` | Contacto para delivery |
| `referralCode` | string | no | `MaxLength(20)` | Código de otro usuario |
| `marketingOptIn` | boolean | no | — | Consentimiento de promos (default `false`) |
| `deviceFingerprint` | string | no | `MaxLength(255)` | ID estable del dispositivo |
| `platform` | string | no | `android` \| `ios` | |

```json
{
  "email": "ana@test.com",
  "password": "Password1!",
  "firstName": "Ana",
  "lastName": "López",
  "deviceFingerprint": "a1b2c3d4e5f6",
  "platform": "android"
}
```

## Responses

### 201 — Creado
```json
{
  "id": "3f8a0c1e-...",
  "email": "ana@test.com",
  "firstName": "Ana",
  "lastName": "López",
  "phone": null,
  "role": "customer",
  "status": "pending_verification",
  "emailVerifiedAt": null,
  "referralCode": "XK2P9QRD",
  "marketingOptIn": false,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### 400 — Validación / `referralCode` inválido
`message` es array en errores de campos; `"Invalid referral code"` si el código no existe.

### 409 — Email ya registrado
```json
{ "statusCode": 409, "message": "Email is already registered", "timestamp": "..." }
```

## Notas

- No devuelve tokens: `pending_verification` no puede operar hasta verificar.
- Campos extra (`role`, `status`, …) se rechazan con 400 (`forbidNonWhitelisted`).
- `referralCode` propio se genera siempre (8 caracteres sin ambiguos).
