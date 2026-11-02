# Pendiente: Endurecimiento de seguridad HTTP (helmet, throttle de prod, CORS)

> **Estado: � PARCIAL** — helmet + compression + fix de fuga de códigos aplicados (propuesta 006); quedan valores env de prod y dos menores
> **Producto:** backend
> **Bloqueo:** recomendado fuerte — no impide el deploy pero expone la API el día 1

## Contexto

Revisión de seguridad previa a producción: el código usa queries parametrizadas (TypeORM), `ValidationPipe` con `whitelist + forbidNonWhitelisted` y `@IsEmail` en DTOs — la inyección SQL está cubierta.

## Resuelto (propuesta 006)

- **`helmet`** — instalado y aplicado en `main.ts` (headers: `X-Content-Type-Options`, `Strict-Transport-Security`, etc.).
- **`compression`** — instalado y aplicado en `main.ts` (respuestas gzip).
- **Fuga de códigos en logs** — hallazgo real: `EmailSenderService.logCode` escribía el código de verificación/reset en plano cuando faltaba `RESEND_API_KEY`. Ahora en producción (`app.isProduction`) loguea `logger.error` sin código ni email y lanza `Email delivery not configured`; el fallback que loguea el código solo corre fuera de prod (dev local).
- **`CORS_ORIGIN`** — decisión tomada: vacío = API solo-móvil (los clientes nativos no envían `Origin`, se deniegan orígenes de navegador). Si a futuro hay panel web se declara el origen explícito. Documentado en `.env.example`.

## Qué falta

- **`THROTTLE_TTL`/`THROTTLE_LIMIT`/`LOG_LEVEL` de prod** — los valores globales holgados (`100/60s`) son correctos a propósito porque los endpoints sensibles tienen `@Throttle` propio (3–10/min, documentado en `.env.example`), pero los valores finales de prod se fijan al configurar el `.env` de deploy — se resuelve junto a `pendientes/003-deploy`.
- **Menor: bcrypt 10 → 12** — subir el costo de hashing antes del deploy (no bloquea).
- **Menor: re-chequeo de revocación del `sid` en `JwtStrategy`** — verificar que el session id del access token se re-valide contra revocación donde corresponda (no bloquea).

## Criterio de cierre

- `curl -I https://<api>/health` muestra headers de seguridad. (helmet ya aplicado — verificar en el entorno de prod al deployar)
- Rate-limit probado contra `/auth/login` devuelve 429 tras N intentos. (los `@Throttle` por endpoint ya existen — verificar valores reales en prod)
- Logs de prod sin secretos. (fuga de códigos corregida; revisión final junto a `LOG_LEVEL` de prod)
