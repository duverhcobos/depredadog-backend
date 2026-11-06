# API — Depredadog

Contrato para consumidores de la API (app Flutter y futuros integradores).

## Convenciones globales

- **Base URL dev**: `http://localhost:3000`
- **Auth**: `Authorization: Bearer <accessToken>` — se obtiene en
  `POST /auth/verify-email` o `POST /auth/login`. Duración: access 15 min,
  refresh 30 días (rotativo — cada `POST /auth/refresh` invalida el anterior).
- **Errores**: `{ "statusCode": N, "message": string | string[], "timestamp": "..." }`
  — `message` es **array** en errores de validación (400, un string por regla).
- **Rate limiting**: límites por endpoint indicados en cada doc. El global es
  100 req/min (`/health` exento).
- **Verificación de email obligatoria**: `register` no devuelve sesión; el
  código de 6 dígitos enviado por email se canjea en `verify-email`, que sí
  devuelve los tokens.
- **Device fingerprint** (opcional en register/verify/login/reset-password/google): identificador
  estable del dispositivo (`ANDROID_ID` en Android; UUID en Keychain en iOS).
  Se usa para anti-fraude de promociones.

## Índice

| Método | Ruta | Doc | Estado |
|--------|------|-----|--------|
| POST | `/auth/register` | [001](auth/001-post-register.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/verify-email` | [002](auth/002-post-verify-email.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/resend-verification` | [003](auth/003-post-resend-verification.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/login` | [004](auth/004-post-login.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/refresh` | [005](auth/005-post-refresh.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/logout` | [006](auth/006-post-logout.md) | 🔶 backend listo — sin integrar |
| GET | `/auth/me` | [007](auth/007-get-me.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/forgot-password` | [008](auth/008-post-forgot-password.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/reset-password` | [009](auth/009-post-reset-password.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/google` | [010](auth/010-post-google.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/check-reset-code` | [011](auth/011-post-check-reset-code.md) | 🔶 backend listo — sin integrar |
| GET | `/catalog` | [catálogo completo](catalog/001-get-catalog.md) | 🔶 backend listo — sin integrar |
| GET | `/store/config` | [001](store/001-get-store-config.md) | 🔶 backend listo — sin integrar |
