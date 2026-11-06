# Pendiente: Onboarding Nequi Conecta ("Pagos con Push") — llaves QA + certificación + producción

> **Estado: ⏸️ PENDIENTE EXTERNO** — depende del proceso comercial/técnico
> de Nequi; el backend no puede generarlo por dentro
> **Producto:** backend
> **Bloqueo:** bloqueante para pagos reales con Nequi — NO bloquea el
> módulo orders (en dev se usa adapter simulado)

## Contexto

El modelo de pagos (`payments.provider = 'nequi'`) y la propuesta 013
dejaron creadas las tablas `orders`/`payments`, pero la integración real
con **Nequi Conecta** (API "Pagos con Push" — el cliente aprueba el cobro
desde su app Nequi) requiere credenciales que solo entrega Nequi tras un
proceso de onboarding:

1. **Llaves de QA** — client_id/client_secret + API key del ambiente de
   pruebas, con el producto "Pagos con Push" habilitado.
2. **Certificación obligatoria** — Nequi exige ejecutar 5 casos de
   prueba en QA antes de habilitar producción:
   - pago aprobado
   - pago rechazado
   - pago expirado (el cliente no aprueba a tiempo)
   - celular sin cuenta Nequi (error al despachar el push)
   - reverso/anulación del pago
3. **Llaves de producción** — tras aprobar la certificación.

## Qué falta

- El dueño/gestor tramita el convenio con Nequi Conecta y obtiene las
  llaves QA → van en `.env` (ver skill `env-secrets`, nunca en el repo).
- Implementar el adapter `payments` real (propuesta futura, 014/015+)
  contra QA y ejecutar los 5 casos de certificación.
- Recibir llaves de producción y configurarlas en el entorno de deploy
  (pendiente 003).

## Criterio de cierre

- Llaves QA en `.env` y el adapter de Nequi pasando los 5 casos de
  certificación en QA.
- Llaves de producción configuradas en el entorno de deploy.
