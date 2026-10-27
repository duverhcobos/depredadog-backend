---
name: pendientes-produccion
description: Checklist de pendientes pre-producción (pendientes/) — ítems que funcionan como workaround de dev/MVP pero deben resolverse o aceptarse antes del deploy; formato, estados y cuándo consultarlos
allowed-tools:
  - read
  - edit
  - grep
  - glob
triggers:
  - user
  - model
---

# Pendientes pre-producción en `pendientes/`

`pendientes/` (raíz de **este** repo) guarda ítems accionables que hoy funcionan como workaround de dev/MVP pero deben resolverse — o aceptarse explícitamente — antes de desplegar a producción. **Convención: cada repo tiene su propia `pendientes/`** — los ítems del lado app viven en `../pcalientes_app/pendientes/` (diferente de `planeaciones/`, que sigue compartida acá).

## Qué SÍ va en `pendientes/`

- Workarounds temporales con costo conocido (ej. GitHub Pages personal en vez de dominio propio).
- Dependencias externas que bloquean producción (ej. comprar dominio, verificar dominio en Resend).
- Deuda de seguridad/config detectada y diferida (ej. verificación de email en registro).

## Qué NO va en `pendientes/`

- Features nuevos → `planeaciones/` + `propuestas/`.
- Decisiones de diseño/arquitectura sin código → `planeaciones/` (ver `planeacion-workflow`).
- Bugs o mejoras del ciclo normal → se resuelven directo, sin documento.

## Formato

Un archivo por ítem: `NNN-titulo-corto.md` (numeración secuencial — revisar el número más alto existente antes de crear). Debajo del título, tres líneas de metadata:

```markdown
# Pendiente: <Título>

> **Estado: 🔴 PENDIENTE** — <detalle breve>
> **Producto:** backend | frontend | ambos
> **Bloqueo:** bloqueante | recomendado | opcional
```

### Estados

| Estado | Significado |
|--------|--------------|
| 🔴 **PENDIENTE** | Sin empezar. |
| ⏸️ **PENDIENTE EXTERNO** | Dependencia fuera del proyecto (ej. compra de dominio). |
| 🟡 **EN CURSO** | Hay trabajo activo (enlazar propuesta/planeación relacionada). |
| 🟢 **RESUELTO** | Verificado resuelto — citar propuesta/commit. No borrar el archivo (queda como registro). |
| ⚪ **DESCARTADO** | Se decidió aceptar el workaround o no hacerlo — dejar el motivo breve. |

### Bloqueo

- **bloqueante**: no se debería desplegar a producción sin resolverlo.
- **recomendado**: se puede salir, con costo/riesgo conocido y aceptado.
- **opcional**: mejora sin urgencia.

Cada documento describe: estado actual (workaround vigente), qué falta, camino de resolución y **criterio de cierre** verificable. Los ítems con dependencias se enlazan entre sí (`depende de 001`).

## Cuándo crear un ítem

- Al introducir conscientemente un workaround temporal en una propuesta o fix.
- Al detectar una dependencia externa o deuda relevante a producción durante implementación o auditoría.
- **Siempre** actualizar también la tabla del `pendientes/README.md` al crear o cambiar el estado de un ítem.

## Cuándo consultar la carpeta

- **Antes de cualquier decisión de deploy/release** — revisar los bloqueantes sin resolver.
- Cuando el usuario pregunte "¿qué falta para producción?".
- Al cerrar un workaround temporal: si su reemplazo definitivo queda diferido, debe existir (o crearse) el ítem que lo registra.

## Relación con propuestas

Resolver un ítem de código probablemente genera una o más propuestas en `propuestas/` — el ítem pasa a 🟡 enlazándolas mientras se trabaja, y a 🟢 cuando quedan implementadas y verificadas.
