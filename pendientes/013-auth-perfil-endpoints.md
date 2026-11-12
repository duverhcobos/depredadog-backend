# Pendiente: endpoints de perfil del cliente (`PATCH /auth/me` + cambio de contraseña)

> **Estado: 🔴 PENDIENTE** — la app (§030.1) ya maqueta "Mis datos" y
> "Cambiar contraseña" con mocks; sin estos endpoints no se puede
> integrar
> **Producto:** backend + app
> **Bloqueo:** no bloqueante para dev (los forms funcionan con mock);
> sí antes de producción — editar datos y cambiar contraseña son
> funcionalidades básicas de cuenta

## Contexto

El tab Perfil del cliente (app §030.1) incluye dos pantallas que no
tienen contrato backend:

- **"Mis datos"** — form de `firstName`/`secondName`/`firstLastName`/
  `secondLastName`/`phone` (email read-only).
- **"Cambiar contraseña"** — actual + nueva + confirmación.

Hoy `AuthController` solo expone registro, verify-email, login,
refresh, forgot/reset y `GET /auth/me` (lectura).

## Qué falta

### `PATCH /auth/me`

- DTO `UpdateProfileDto`: `firstName`?, `secondName`?,
  `firstLastName`?, `secondLastName`?, `phone`? — mismos límites de
  validación que `RegisterDto` (verificar y replicar).
- Use-case `UpdateProfileUseCase`: update parcial del propio usuario
  (id del JWT — no acepta `:id`, no es IDOR-able por diseño).
- **Email fuera del DTO** — la app lo muestra read-only: cambiarlo
  requeriría re-verificación (`email_verified_at` se invalidaría);
  si algún día se pide, es endpoint aparte con su propio flujo.
- Respuesta: el usuario actualizado (misma forma que `GET /auth/me`).

### `POST /auth/change-password`

- DTO: `currentPassword` + `newPassword` (min = regla de registro).
- Verifica `currentPassword` contra el hash → 400/`invalid credentials`
  genérico si no coincide (sin revelar cuál falló).
- Re-hash bcrypt + update. Decidir: ¿invalida otros refresh tokens
  activos? (recomendado — cambio de contraseña como medida de
  seguridad; el device actual sobrevive con su access token hasta
  que expire o se re-emiten tokens).
- Respuesta: 204.

## Criterio de cierre

Los dos forms del perfil integran contra endpoints reales con tests;
el cambio de contraseña queda documentado en `documentacion/api/`
(comportamiento con refresh tokens explícito).
