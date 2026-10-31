# POST /auth/check-reset-code

> Chequea el código de reset **sin consumirlo** — paso intermedio del wizard
> de recuperación (verificar el código antes de pedir la nueva contraseña).

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/check-reset-code` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 5 req/min |
| **Implementado** | propuesta 005 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `email` | string | sí | `IsEmail` | |
| `code` | string | sí | `^\d{6}$` | Código del email de reset |

```json
{ "email": "ana@test.com", "code": "483920" }
```

## Responses

### 200 — Código válido
```json
{ "message": "Reset code is valid." }
```

### 400 — Código inválido/expirado/consumido
```json
{ "statusCode": 400, "message": "Invalid or expired code", "timestamp": "..." }
```
Mismo mensaje para cualquier fallo (usuario inexistente, suspendido, código
errado/expirado/consumido) — no revela qué falló.

### 400 — Validación del body
```json
{ "statusCode": 400, "message": ["code must be a 6-digit number"], "timestamp": "..." }
```

### 429 — Rate limit excedido
```json
{ "statusCode": 429, "message": "Too many requests", "timestamp": "..." }
```

## Notas

- **No consume el código**: `POST /auth/reset-password` lo revalida y consume
  atómicamente — si el código expira entre este chequeo y el reset, el reset
  responde el mismo 400 genérico y la app debe devolver al usuario al paso
  del código.
- Es el paso 2 del wizard de recuperación (correo → código → nueva
  contraseña): valida el código antes de pedir la clave.
