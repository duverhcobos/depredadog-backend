# Pendiente: Verificar dominio en Resend para emails transaccionales

> **Estado: 🔴 PENDIENTE** — `EmailSenderService` ya envía vía Resend API, pero sin dominio verificado solo puede mandar al email de la propia cuenta.
> **Producto:** backend
> **Bloqueo:** bloqueante

## Estado actual (workaround vigente)

El envío real está implementado (`fetch` a `api.resend.com` con `RESEND_API_KEY`
y `EMAIL_FROM`), pero con la cuenta gratuita **sin dominio verificado**, Resend
solo entrega a la dirección del dueño de la cuenta — los usuarios reales no
reciben códigos. Mientras `RESEND_API_KEY` esté vacío, el servicio cae al
fallback que loguea el código (dev local + e2e por spy).

## Qué falta

- Registrar/verificar un dominio en Resend (DNS: SPF/DKIM) — requiere dominio propio.
- `EMAIL_FROM` con ese dominio (ej. `Depredadog <no-reply@tudominio.com>`).
- `RESEND_API_KEY` de producción en las env vars del entorno real (`env-secrets`).

## Camino de resolución

- Paso de configuración externa, no propuesta de código: el contrato del servicio no cambia.
- Alternativa si no hay dominio propio aún: SMTP transaccional (SendGrid/AWS SES) — cambio acotado al mismo `EmailSenderService`.

## Criterio de cierre

- Un registro real con email ajeno a la cuenta Resend recibe el código de verificación.
