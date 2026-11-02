# Propuesta: Hardening HTTP + fuga de códigos en logs (pendiente 004)

Origen: evaluación del módulo auth previa a producción. Pendiente 004 pide
helmet, compression, valores throttle/CORS de prod y auditar logs sin
secretos. La auditoría encontró una fuga real: `EmailSenderService` loguea
**el código de verificación en plano** cuando `RESEND_API_KEY` está vacío —
fallback de dev que también correría en producción, donde cualquier acceso
a logs = reset de contraseñas.

## Decisiones de diseño

- **helmet + compression**: middlewares estándar en `main.ts` — helmet con
  config por defecto (API sin HTML: CSP/HSTS no aplican pero el resto de
  headers sí); compression sin opciones.
- **Fuga de códigos**: el fallback `logCode` solo corre cuando
  `!app.isProduction`. En prod sin API key → `logger.error` (sin código,
  sin email) + `throw Email delivery not configured` — el throw lo atrapa
  el best-effort de `VerificationCodeService` → respuesta genérica
  preservada (anti-enumeración intacta) y el error queda visible en logs
  de ops para detectar la mala configuración.
- **CORS**: decidido por el usuario — `CORS_ORIGIN` vacío = denegar
  orígenes de navegador (correcto para API solo-móvil: los clientes
  nativos no envían `Origin`). Si a futuro hay panel web se declara el
  origen explícito.
- **Throttle prod**: los valores globales (`100/60s`) se mantienen — los
  endpoints sensibles ya tienen `@Throttle` propio más estricto
  (3–10/min). Se documenta la recomendación en `.env.example`.
- **Fuera de alcance**: bcrypt 10→12 y re-chequeo de revocación del `sid`
  en JwtStrategy quedan como menores en el pendiente (no bloquean).

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `package.json` | `npm i helmet compression` + `npm i -D @types/compression` |
| `src/main.ts` | `app.use(helmet())` + `app.use(compression())` tras crear la app |
| `src/modules/auth/infrastructure/services/email-sender.service.ts` | `send()`: sin API key → si `app.isProduction` loguea error sin código y lanza; si no, fallback `logCode` como hoy |
| `src/modules/auth/infrastructure/services/email-sender.service.spec.ts` | test existente sin-API-key pasa a simular dev; nuevo test prod: sin key → lanza + error sin código en el mensaje |
| `test/health.e2e-spec.ts` | agregar aserción de un header helmet (ej. `x-content-type-options: nosniff`) en `/health` |
| `.env.example` | comentarios: CORS vacío = API solo-móvil (decisión); throttle global 100/60s OK porque los sensibles tienen límite propio |
| `pendientes/004-seguridad-headers-throttle.md` | estado → resuelto en parte; quedan: valores env de prod (se resuelven con 003-deploy), bcrypt 12 y sid-check como menores |

## Orden de aplicación

1. `npm i helmet compression && npm i -D @types/compression`
2. `main.ts` middlewares
3. `email-sender.service.ts` + spec
4. e2e health + `.env.example`
5. Actualizar `pendientes/004`
6. `npm run build` + `npm run test` + `npm run test:e2e`
