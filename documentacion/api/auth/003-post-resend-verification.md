# POST /auth/resend-verification

> Emite un nuevo código de verificación e invalida el anterior.
> Respuesta siempre genérica (anti-enumeración).

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/resend-verification` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 3 req/min |
| **Implementado** | propuesta 002 |

## Request

### Body
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `email` | string | sí | `IsEmail` |

```json
{ "email": "ana@test.com" }
```

## Responses

### 200 — Siempre el mismo mensaje
```json
{ "message": "If that email is registered and unverified, a new code has been sent." }
```

## Notas

- Da la misma respuesta para: email inexistente, ya verificado, o código nuevo emitido — no revela si la cuenta existe.
- El código anterior queda invalidado aunque aún no haya expirado.
