---
name: env-secrets
description: Manejo de variables de entorno y secretos de este backend — inventario, archivos .env/.env.test/.env.example, cómo agregar una variable nueva, higiene de secretos
---

Variables de entorno y secretos del backend (`template_nestj`).
Invocar **siempre** que se agregue una config nueva, se toquen URLs,
credenciales, tokens o puertos.

## Archivos

| Archivo | Rol | ¿Se commitea? |
|---------|-----|---------------|
| `.env` | Desarrollo local real — la BD de dev, secrets de dev | **NO** (en `.gitignore`) |
| `.env.test` | BD de test `<app>_test` para `test:e2e` | **NO** |
| `.env.example` | Plantilla documentada sin valores reales | **SÍ** — siempre al día |

## Inventario actual (de `.env.example`)

- **App**: `PORT` (validado — propuesta), `NODE_ENV`, `CORS_ORIGIN`
  (lista separada por comas, sin default `*` — propuesta).
- **DB**: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`,
  `DB_DATABASE`.
- **JWT**: `JWT_SECRET` (string largo aleatorio en prod), `JWT_EXPIRES_IN`.
- **Esquema**: `MIGRATIONS_RUN` (corre migraciones al arrancar — solo dev;
  en prod `false` y correrlas como paso de deploy), `DB_SYNCHRONIZE`
  (**siempre `false`**, ver `migrations-workflow`).
- **Logger**: `LOG_LEVEL`, `LOG_MAX_FILES`, `LOG_MAX_SIZE`, `LOG_DIR`.
- **Throttler**: `THROTTLE_TTL`, `THROTTLE_LIMIT`.
- **Metrics**: `METRICS_PORT` — puerto separado de la API, exponer solo en
  red interna, **nunca** mapearlo público en el gateway.

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
- Exponer `METRICS_PORT` ni endpoints internos al público.
