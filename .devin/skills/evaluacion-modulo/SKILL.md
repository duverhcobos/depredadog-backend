---
name: evaluacion-modulo
description: Gate obligatorio al cerrar un módulo del backend — evaluación 10/10 de producción con rúbrica por lado, gaps clasificados por severidad, críticos resueltos en el momento y el resto a pendientes/
allowed-tools:
  - read
  - grep
  - glob
  - exec
  - run_subagent
triggers:
  - user
  - model
---

## Cuándo corre

**Gate obligatorio al cerrar un módulo** (auth, catalog, orders, payments, ...):
antes de declarar el módulo terminado y pasar al siguiente, correr esta
evaluación. También cuando el usuario pida "evalúa el módulo X" en cualquier
momento.

## Qué produce

1. **Score /10 por lado** (backend y frontend por separado — el frontend
   evalúa el suyo con su propia skill; aquí se califica el backend).
2. **Tabla de gaps** con severidad `[CRITICO / IMPORTANTE / MENOR]` y
   evidencia `archivo:línea` — nunca una opinión sin citar el código.
3. **CRÍTICO → se resuelve en el momento** (propuesta + implementación +
   verificación, flujo normal de propuestas). **IMPORTANTE/MENOR → pendiente**
   documentado en `pendientes/` con el formato del skill pendientes-produccion.

## Rúbrica backend (qué revisa un 10/10)

**Seguridad**
- Ningún secreto, token, código de verificación/reset, contraseña ni PII
  sensible llega a logs **en producción** (los fallbacks dev deben estar
  gateados por `app.isProduction`).
- Tokens/códigos persistidos hasheados, TTLs correctos, rotación y detección
  de reuso donde aplique.
- `@Throttle` explícito en cada endpoint sensible + límite global razonable.
- `ValidationPipe` whitelist/forbidNonWhitelisted + DTOs con validadores.
- `idor-checklist` aplicado a todo endpoint que recibe un identificador de
  recurso; guards de rol/propiedad donde toca.
- Anti-enumeración preservada donde el diseño la exige (respuestas genéricas,
  envío best-effort).

**Funcionalidad**
- Todo endpoint del módulo existe, está mapeado y responde el contrato
  documentado en `documentacion/api/` (status codes + bodies reales).
- Casos borde del dominio cubiertos (duplicados, expiración, estados
  inválidos, concurrencia/carerras donde aplique).

**Datos**
- Migraciones corridas en dev y test, `revert` verificado.
- Listados: paginación + índices + anti-N+1 (`listados-paginacion-indices`).
- RLS donde el modelo lo exige.

**Arquitectura**
- Layering estricto: domain sin imports de infra, use-cases no construyen
  DTOs, mapper de aplicación presente (`strict-layering-rule`).
- Convenciones del repo (`code-conventions`, `code-patterns`).

**Pruebas y docs**
- `.spec.ts` por use-case/servicio crítico + e2e por endpoint — **todo verde**.
- `documentacion/api/<endpoint>.md` al día, `.env.example` +
  `env.validation.ts` con cada variable nueva.
- `pendientes/` refleja el estado real del módulo.

## Clasificación de severidad

- **CRITICO**: rompe el flujo de un usuario real en prod, filtra
  secretos/datos, o deja el módulo inutilizable en producción.
- **IMPORTANTE**: degrada seguridad/UX o deja un caso borde real sin cubrir,
  pero existe workaround.
- **MENOR**: polish, convención menor, mejora de mantenibilidad.

## Formato del reporte

```
## Backend — X/10
Lo que ya está: <tabla área → evidencia>
Lo que falta para el 10:
- CRITICO: <gap> (<archivo:línea>) → se resuelve ahora
- IMPORTANTE/MENOR: <gap> → pendientes/NNN
```

Tras resolver los críticos, reportar score final y pendientes creados.
