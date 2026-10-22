---
name: planeacion-workflow
description: Convención de "Estado" para documentos de planeación (planeaciones/) de este backend — a diferencia de propuestas/, no implican código
allowed-tools:
  - read
  - edit
  - grep
  - glob
triggers:
  - user
  - model
---

# Estado de los documentos en `planeaciones/`

`planeaciones/` guarda **especificación sin código** (diseño de endpoints, decisiones de arquitectura pendientes, etc.) — es la fuente que luego se traduce a una o más propuestas de implementación en `propuestas/` (ver skill `propuesta-workflow`). A diferencia de una propuesta, un documento de planeación no tiene un único estado binario "implementado/no implementado": puede quedar en definición, decidido pero sin implementar, parcialmente implementado, o descartado.

## Regla

Todo archivo en `planeaciones/` lleva una línea de estado justo debajo del título, mismo estilo que `propuestas/` (`> **Estado: ...** — <detalle>`):

```markdown
# Planeación: <Título>

> **Estado: 🟡 EN DEFINICIÓN** — <qué falta decidir o quién tiene que aprobarlo>
```

### Valores posibles

| Estado | Significado |
|--------|--------------|
| 🟡 **EN DEFINICIÓN** | El diseño todavía puede cambiar; no está aprobado para pasar a una propuesta de implementación. |
| 🟢 **DECIDIDO** | El diseño quedó fijo (aprobado por el usuario); listo para convertirse en una o más propuestas en `propuestas/`, pero **todavía sin código**. |
| 🔵 **IMPLEMENTADO (total/parcial)** | Ya se tradujo a código vía propuesta(s) — enlazar el/los número(s) (ej. "vía `propuestas/027`"). Si es parcial, aclarar qué falta. |
| ⏸️ **PENDIENTE DE DECISIÓN EXTERNA** | No depende de una decisión de diseño interna sino de algo externo al proyecto todavía sin definir (ej. proveedor de deploy, cantidad de instancias). |
| ⚪ **DESCARTADO** | Se decidió no avanzar — dejar el motivo breve, no borrar el documento (queda como registro). |

### Documentos con varias decisiones independientes

Si el documento agrupa varias decisiones que se resuelven en momentos distintos (ej. `002-decisiones-pendientes-deploy.md`, con 3 puntos independientes), además del estado global del documento, cada sección numerada lleva su propio `**Estado:**` inline — el estado global refleja el peor caso (si una decisión sigue pendiente, el documento entero no puede estar en 🔵 IMPLEMENTADO).

## Cuándo actualizar el estado

- Al aprobar/cerrar una discusión de diseño dentro del documento → pasar de 🟡 a 🟢.
- Al crear la propuesta de implementación correspondiente en `propuestas/` → agregar la referencia, pero mantener 🟢 hasta que la propuesta esté efectivamente implementada.
- Al verificar (mismo criterio que `propuesta-workflow`: tests, `tsc --noEmit`, verificación en vivo) que la propuesta quedó implementada → pasar a 🔵, citando el número de propuesta.
