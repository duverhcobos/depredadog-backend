# Pendiente: Endurecimiento de seguridad HTTP (helmet, throttle de prod, CORS)

> **Estado: 🔴 PENDIENTE** — la API no tiene headers de seguridad ni compresión; el rate-limit corre con valores de dev
> **Producto:** backend
> **Bloqueo:** recomendado fuerte — no impide el deploy pero expone la API el día 1

## Contexto

Revisión de seguridad previa a producción: el código usa queries parametrizadas (TypeORM), `ValidationPipe` con `whitelist + forbidNonWhitelisted` y `@IsEmail` en DTOs — la inyección SQL está cubierta. Pero el servidor **no tiene `helmet` ni `compression` instalados** y el throttling usa los valores por defecto de `.env`.

## Qué falta

- **`helmet`** — `npm i helmet` + `app.use(helmet())` en `main.ts` (headers: `X-Content-Type-Options`, `Strict-Transport-Security`, etc.).
- **`compression`** (opcional, recomendado) — respuestas gzip.
- **`THROTTLE_TTL`/`THROTTLE_LIMIT` de prod** — revisar que los valores de `.env` sean razonables para `/auth/login` y recuperación de contraseña (endpoints sensibles a brute-force). Evaluar throttles específicos por endpoint si el límite global queda holgado.
- **`CORS_ORIGIN`** — decidir el valor real para una app móvil (los clientes nativos no mandan `Origin`; `credentials: true` + origen específico o evaluar si se puede restringir más).
- **Auditar `LOG_LEVEL`/logs** — que en prod no se registren tokens, contraseñas ni códigos de verificación.

## Criterio de cierre

- `curl -I https://<api>/health` muestra headers de seguridad.
- Rate-limit probado contra `/auth/login` devuelve 429 tras N intentos.
- Logs de prod sin secretos.
