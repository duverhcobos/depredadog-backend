---
name: modelo-evolucion
description: Cómo proponer cambios al modelo de datos documentado cuando la implementación descubre un campo/tabla/constraint faltante — el modelo es propuesta, no ley; sugerir primero, implementar tras aprobación
---

El documento del modelo de datos (`documentacion/`, creado cuando el
proyecto lo defina) es la **fuente diseñada**, no la verdad final. La
implementación descubre
cosas que el modelo no previó — campos faltantes, constraints, columnas de
auditoría, tipos distintos. Esta skill define cómo tratar esas
desviaciones sin romper la coherencia doc↔código.

## Regla madre

**Nunca implementar en silencio una desviación del modelo documentado.**
Si al implementar una propuesta el modelo no cubre lo que el endpoint
necesita, el flujo es:

1. **Detectar** el gap durante el diseño de la propuesta (no a mitad del
   código — si aparece implementando, parar y documentarlo).
2. **Anotarlo en la propuesta** como decisión pendiente con:
   - Qué falta en el modelo (campo, tabla, constraint, índice, tipo).
   - La sugerencia concreta (nombre, tipo, null/default, motivo).
   - Por qué el modelo actual no lo cubre.
3. **El usuario aprueba o ajusta** — igual que cualquier propuesta.
4. **Implementar** el cambio aprobado (migración + schema).
5. **Actualizar el documento del modelo** en el mismo
   propuesta/commit — el doc debe quedar siempre al día con lo que existe,
   no con lo que se pensó originalmente.

## Ejemplos de cuándo aplica

- Falta una columna que el endpoint necesita (ej. `user.last_login_at`
  existía; si hubiera faltado → sugerirla, no agregarla callado).
- Un constraint distinto al modelado (ej. email único global vs. por
  organización — decisiones como esa se documentan en la propuesta).
- Una tabla no modelada que un endpoint requiere (ej. si `user_session`
  no hubiera existido en el diseño).
- Un tipo de dato sub-óptimo en el modelo (ej. `TEXT` donde conviene
  `timestamptz`, falta de índice para un listado frecuente).
- Un default de negocio (ej. `settlement_period_days = 15` ya vino
  resuelto — ese es el patrón a seguir).

## Lo que NO aplica

- Bugs o desviaciones de lo que YA está migrado — eso se corrige con
  migración de corrección, no es "evolución del modelo".
- Campos puramente de presentación (DTOs) que no tocan la BD.
- Cambios triviales de naming que ya resolvió la convención inglés
   — eso está fijado, no se re-debate.

## Formato de la sugerencia dentro de una propuesta

```markdown
### Desviación del modelo — aprobación requerida

- **Qué falta**: `user_session` no tiene `last_used_at` y el endpoint X
  lo necesita para Y.
- **Sugerencia**: `last_used_at timestamptz null` + actualizar en cada
  refresh exitoso.
- **Por qué el modelo no lo cubre**: el diseño original solo pensó en
  expiración, no en "último uso".
```

Si el usuario la aprueba, la migración + schema + el update del doc van
**en la misma propuesta** — nunca "el modelo después se actualiza".
