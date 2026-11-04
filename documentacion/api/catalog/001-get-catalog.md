# GET /catalog

> Menú completo: categorías activas con productos, imagen primaria y el
> árbol de modificadores por producto (ingredientes / toppings / salsas
> con defaults y precios). Una sola llamada alimenta home, lista y
> detalle de la app — pensada para cachearse y refrescarse al entrar al
> detalle o al checkout.

| | |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/catalog` |
| **Autenticación** | Bearer token requerido |
| **Rol requerido** | cualquier usuario autenticado |
| **Rate limit** | default global (100 req/min) |
| **Implementado** | propuesta 007 |
| **Integrado en app** | ⬜ pendiente |

## Request

Sin body ni query params.

## Responses

### 200 — Menú

```json
{
  "categories": [
    {
      "id": "uuid",
      "slug": "perros",
      "name": "Perros",
      "sortOrder": 0,
      "products": [
        {
          "id": "uuid",
          "name": "El Cachorro",
          "description": "El primer mordisco de la manada.",
          "basePrice": 14000,
          "imageUrl": null,
          "isAvailable": true,
          "isFeatured": false,
          "isCombo": false,
          "sortOrder": 0,
          "modifierGroups": [
            {
              "id": "uuid",
              "slug": "ingredients",
              "name": "Ingredientes",
              "minSelect": 0,
              "maxSelect": null,
              "options": [
                {
                  "id": "uuid",
                  "name": "Queso mozzarella",
                  "extraPrice": 3500,
                  "isAvailable": true,
                  "includedByDefault": true,
                  "isRemovable": true,
                  "sortOrder": 6
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

| Campo | Descripción |
|-------|-------------|
| `categories[].products[]` | Incluye `isAvailable=false` (la app los muestra "agotados") y excluye soft-deleted. Categorías sin productos llegan con `products: []`. |
| `imageUrl` | Imagen primaria del producto; `null` mientras no haya fotos hospedadas (la app usa sus assets locales por convención de slug). |
| `modifierGroups[].slug` | Clave estable del grupo: `ingredients` (adicionar/quitar), `toppings`, `sauces` — no depender del `name` editable. |
| `options[].includedByDefault` | `true` = viene en el producto salvo que el cliente lo quite (por producto). |
| `options[].isRemovable` | `false` = obligatorio (pan, salchicha) — no se desmarca aunque venga por defecto. |
| `options[].extraPrice` | COP como número entero; `0` = gratis (toppings/salsas). |

### 401 — Sin token / token inválido

Formato estándar `{ "statusCode": 401, "message": "Unauthorized" }`.

## Notas

- La **integridad de disponibilidad** la re-valida `orders` al crear el
  pedido (un ingrediente puede agotarse entre cargar el menú y ordenar);
  este endpoint solo da el estado fresco al momento de la llamada.
- `isAvailable` existe a nivel producto Y opción — apagar una opción la
  apaga en TODO el menú (catálogo compartido).
