# POST /auth/forgot-password

> Solicita un código de reset de contraseña. Respuesta siempre genérica
> (anti-enumeración).

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/forgot-password` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 3 req/min |
| **Implementado** | propuesta 003 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `email` | string | sí | `IsEmail` | |

```json
{ "email": "ana@test.com" }
```

## Responses

### 200 — Mensaje genérico
```json
{ "message": "If that email is registered, a reset code has been sent." }
```
Idéntico exista o no el email (anti-enumeración). El código de 6 dígitos llega
por email y se canjea en `POST /auth/reset-password`.

### 400 — Validación
```json
{ "statusCode": 400, "message": ["email must be an email"], "timestamp": "..." }
```

## Notas

- El código vence a los 15 min (configurable vía `AUTH_CODE_TTL_MINUTES`) y un
  nuevo `forgot-password` invalida el anterior.
- Usuarios "solo-Google" también pueden resetear — el reset les crea una
  contraseña acreditada por posesión del email.
