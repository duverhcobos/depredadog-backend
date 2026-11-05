# Pendiente: Catálogo real de toppings y salsas (datos de negocio)

> **Estado: � RESUELTO** (propuesta 012) — el dueño entregó la carta
> real y el seed la siembra: 8 toppings + 8 salsas reales, precios de
> adiciones del menú, salchicha sin extra (sin doble — decisión del
> usuario), papas "como estaba", cheddar solo como adición paga
> **Producto:** ambos (espejo de `pcalientes_app/pendientes/009`)
> **Bloqueo:** bloqueante — el seed/catálogo debe reflejar el menú real
> del negocio antes de lanzar

## Contexto

El modelo de datos define `modifier_groups` + `modifier_options` como el
mecanismo compartido de personalización (incluidos, removibles, extras
pagos, `max_select`). Pero el **contenido real del catálogo** — qué
toppings y qué salsas existen en el negocio — nunca fue entregado: la
app hoy muestra nombres inventados como mock de presentación.

Las **reglas de negocio sí están confirmadas**: toppings y salsas gratis,
ilimitados, sí/no; ingredientes propios quitables; ingrediente de otro
perro = adicional pago; pan + salchicha no quitables.

## Qué falta (datos que debe confirmar el dueño)

- Lista real de **toppings** (nombres tal como se venden).
- Lista real de **salsas**.
- "Las salsas de la casa": ¿catálogo global o salsas exclusivas por
  producto?
- Ambigüedad cheddar: "salsa de queso cheddar" modelada como ingrediente
  adicional pago — confirmar si también es salsa gratis seleccionable.
- Alcance: ¿una sola lista global, o subconjuntos por categoría
  (perros / papas)?
- Nota del evaluacion-modulo: hoy `Manada de Papas` quedó enlazada al
  grupo `ingredients` igual que los perros → ofrece pan y salchicha como
  adicionales pagos. Revisar con el menú real si papas debe tener
  grupos/opciones propios.

## Criterio de cierre

- El seed/migración del catálogo contiene las listas reales confirmadas.
- Resueltas las ambigüedades de "salsas de la casa", cheddar y alcance
  por categoría.
