# Propuesta 012 — Seed del menú real (entrega del dueño)

> Cierra `pendientes/005` (backend) + `pendientes/009` (app, espejo) —
> el dueño entregó la carta real. Solo toca `catalog.seed.ts` + estado
> de pendientes; sin migraciones ni cambios de contrato.

## Menú real confirmado (fuente: mensaje del usuario)

- **6 perros** — mismos del seed (composición, tagline y precio ya
  cuadran; composiciones verificadas contra `defaultOptionIds`).
- **Toppings (8, gratis, ilimitados, en todos los perros)**: Cebolla
  picada, Tomate picado con cilantro, Pepinillos agridulces, Jalapeños,
  Tostacos, Papas ripio, Madurito, Guacamole.
- **Salsas (8, gratis)**: Salsa rosada, Salsa de tomate, Salsa de piña,
  Salsa de ajo, Mayomostaza, Salsa picante, Salsa Depredador (de la
  casa), BBQ ahumada.
- **Adiciones (10, globales)**: huevo 2.500, tocineta 4.000, carne
  6.000, pollo 5.000, salami 4.000, mozzarella 3.500, cheddar 4.000,
  chile 5.000, maíz 2.500, piña 2.500.
- **Manada de Papas $10.000** — decisión del usuario: "déjala como
  está" (sigue enlazada a los 3 grupos → ofrece adiciones y chips
  de toppings/salsas; sin ingredientes incluidos).
- Ambigüedad cheddar resuelta: es adición/ingrediente pago, NO salsa
  gratis (no aparece en la lista de salsas del menú).
- **Sin doble salchicha** (decisión del usuario): las adiciones del
  menú no la incluyen → `extra_price` de Salchicha pasa a 0, igual
  que Pan — la opción sigue incluida/esencial pero ya no se lista
  como extra en ningún producto (la app la filtra por precio 0).

## Cambios en `catalog.seed.ts`

1. **`ingredientOptions`** — precios del menú real:
   `extraPrice` → Salchicha americana **0** (era 5000), Carne
   desmechada **6000** (era 5000), Pollo desmechado **5000** (era
   4500), Chile con carne **5000** (era 4500), Salsa de queso cheddar
   **4000** (era 3000), Piña en trozos **2500** (era 3000). Los demás
   ya coinciden.
2. **`toppingOptions`** → las 8 reales en orden del menú. Repurposar
   ids u(121–125) renombrando (misma técnica que el slug de productos:
   `UPDATE … SET name` post-insert) + ids nuevos u(126–128) para las
   3 adicionales:
   121 Papas ripio · 122 Cebolla picada · 123 Tomate picado con
   cilantro · 124 Pepinillos agridulces · 125 Jalapeños · 126 Tostacos
   · 127 Madurito · 128 Guacamole.
3. **`sauceOptions`** → las 8 reales en orden del menú. Repurposar
   u(131–137) + nuevo u(138):
   131 Salsa rosada · 132 Salsa de tomate · 133 Salsa de piña · 134
   Salsa de ajo · 135 Mayomostaza · 136 Salsa picante · 137 Salsa
   Depredador · 138 BBQ ahumada.
4. **UPDATEs post-insert** (patrón existente de los UPDATEs de flags):
   - `UPDATE modifier_options SET name=… WHERE id=…` para cada id
     repurposado (el ON CONFLICT no renombra filas viejas).
   - `UPDATE modifier_options SET extra_price=… WHERE name=…` para
     los 6 precios cambiados.
   - Los UPDATEs de flags (esencial/reemplazo) se conservan; las
     opciones nuevas heredan defaults correctos (elegibles, no
     esenciales — igual que el resto de toppings/salsas, que nunca
     entran al picker porque son otros grupos).
5. **Comentarios del seed**: quitar la nota "provisionales/mock
   (pendientes/005)" — ya es la carta real.

## Cierre de pendientes

- `pendientes/005` → **RESUELTO**: listas reales confirmadas y
  sembradas; cheddar = adición paga; alcance papas = "como está"
  (sigue con los 3 grupos; la única corrección real que traía la nota
  — salchicha vendible en papas — se cierra sola porque la salchicha
  deja de ser extra en TODO el menú).
- `pendientes/009` (app, espejo) → **RESUELTO** al sembrar: la app no
  tiene datos propios que actualizar — nombres y precios fluyen por
  `GET /catalog`. Sin cambios en la app (fixtures de test son
  sintéticos, no reflejan el menú real ni lo necesitan).

## Verificación

- `npm run build` + suite unitaria (113) — sin regresiones.
- Re-correr `npm run seed:catalog` en dev → verificar por query:
  nombres y `extra_price` de las 8+8+12 opciones, `extra_price=0` de
  salchicha, sin filas con nombres mock viejos.
- E2E catálogo verde (los specs usan fixtures propios, no la seed).
