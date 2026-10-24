---
name: env-secrets
description: Manejo de variables de entorno y secretos de este backend — inventario, archivos .env/.env.test/.env.example, cómo agregar una variable nueva, higiene de secretos
---

Variables de entorno y secretos del backend (`pcalientes_backend`).
Invocar **siempre** que se agregue una config nueva, se toquen URLs,
credenciales, tokens o puertos.

## Archivos

| Archivo | Rol | ¿Se commitea? |
|---------|-----|---------------|
| `.env` | Desarrollo local real — la BD de dev, secrets de dev | **NO** (en `.gitignore`) |
| `.env.test` | BD de test `<app>_test` para `test:e2e` | **NO** |
| `.env.example` | Plantilla documentada sin valores reales | **SÍ** — siempre al día |

## Inventario actual (de `.env.example`)

- **App**: `NODE_ENV`, `PORT`, `CORS_ORIGIN` (lista separada por comas, sin
  default `*`).
- **DB**: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`.
- **Esquema**: `MIGRATIONS_RUN` (corre migraciones al arrancar — `true` solo
  en dev/test local; en prod `false` y correrlas como paso de deploy).
  `DB_SYNCHRONIZE` existe como guard rail documentada (`false`) pero **no se
  lee** — `synchronize` está hardcodeado a `false` en `database.config.ts`;
  no reintroducirla como flag real.
- **JWT**: `JWT_SECRET` (string largo aleatorio, `crypto.randomBytes(48)`),
  `JWT_ACCESS_TTL` (15m), `JWT_REFRESH_TTL_DAYS` (30).
- **Auth**: `AUTH_CODE_TTL_MINUTES` (15), `GOOGLE_CLIENT_IDS` (separados por
  coma — vacío = `/auth/google` rechaza; se obtienen en Google Cloud Console).
- **Email**: `RESEND_API_KEY` (vacío = fallback a log, dev/e2e no bloqueados),
  `EMAIL_FROM` (remitente verificado en Resend; sin dominio verificado solo
  `onboarding@resend.dev` hacia el email de la propia cuenta).
- **Logger**: `LOG_LEVEL`, `LOG_DIR`, `LOG_MAX_FILES`, `LOG_MAX_SIZE`.
- **Throttler**: `THROTTLE_TTL`, `THROTTLE_LIMIT`.

## Cómo agregar una variable nueva

1. Declararla en `.env.example` con comentario y valor placeholder seguro
   (nunca un secreto real).
2. Agregarla al `.env` y `.env.test` locales (no se commitean — el que
   clona copia desde `.env.example`).
3. Leerla vía `ConfigService` con su **namespace** correspondiente —
   nunca `process.env` directo en código de módulos.
4. Validarla si es crítica para arrancar — fallar rápido y claro, no
   caer en un default silencioso.
5. Si es un secreto de un servicio externo (Google OAuth, SMTP, etc.),
   documentar de dónde se obtiene el valor en el comentario del
   `.env.example`.

## Higiene de secretos — nunca

- Commitear `.env`/`.env.test` ni valores reales en `.env.example`,
  propuestas o documentación.
- Loguear secrets, tokens, passwords ni `password_hash` — el logger
  Winston persiste a `logs/`; el audit log registra eventos, no
  credenciales.
- Reusar `JWT_SECRET` entre entornos (dev ≠ prod).
- Loguear bodies HTTP completos (pueden contener passwords/códigos) — los
  interceptores de logging deben excluir `body`.
