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
| **Autenticación** | Pública (propuesta 020) |
| **Rol requerido** | — |
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
          "slug": "cachorro",
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
                  "sortOrder": 6,
                  "isReplaceable": true,
                  "isReplacementEligible": true,
                  "isEssential": false
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "promotions": [
    {
      "slug": "combo-cachorro",
      "name": "Combo Cachorro",
      "tagline": "Un antojo bien cazado.",
      "kind": "fixed_bundle",
      "sortOrder": 0,
      "display": {
        "priceLabel": "$17.000",
        "componentProductIds": [
          "ca7a1090-0000-4000-8000-000000000201",
          "ca7a1090-0000-4000-8000-000000000231"
        ]
      },
      "config": {
        "items": [
          {
            "productId": "ca7a1090-0000-4000-8000-000000000201",
            "qty": 1
          },
          {
            "productId": "ca7a1090-0000-4000-8000-000000000231",
            "qty": 1
          }
        ],
        "price": 17000
      }
    },
    {
      "slug": "papas-gratis",
      "name": "Papas Gratis",
      "tagline": "Con 2 o 3 perros, las papas van de la casa.",
      "kind": "free_item",
      "sortOrder": 1,
      "display": {
        "priceLabel": "desde $28.000",
        "eligibleProductIds": [
          "ca7a1090-0000-4000-8000-000000000201",
          "ca7a1090-0000-4000-8000-000000000202",
          "ca7a1090-0000-4000-8000-000000000203",
          "ca7a1090-0000-4000-8000-000000000204",
          "ca7a1090-0000-4000-8000-000000000205",
          "ca7a1090-0000-4000-8000-000000000206"
        ],
        "freeProductId": "ca7a1090-0000-4000-8000-000000000231"
      },
      "config": {
        "eligibleProductIds": [
          "ca7a1090-0000-4000-8000-000000000201",
          "ca7a1090-0000-4000-8000-000000000202",
          "ca7a1090-0000-4000-8000-000000000203",
          "ca7a1090-0000-4000-8000-000000000204",
          "ca7a1090-0000-4000-8000-000000000205",
          "ca7a1090-0000-4000-8000-000000000206"
        ],
        "minQty": 2,
        "maxQty": 3,
        "freeProductId": "ca7a1090-0000-4000-8000-000000000231",
        "freeQty": 1
      }
    },
    {
      "slug": "duo-alfa",
      "name": "Dúo Alfa",
      "tagline": "Dos Depredador y las papas van de la casa.",
      "kind": "showcase",
      "sortOrder": 2,
      "display": {
        "priceLabel": "$36.000",
        "componentProductIds": [
          "ca7a1090-0000-4000-8000-000000000206",
          "ca7a1090-0000-4000-8000-000000000206"
        ]
      },
      "config": {
        "items": [
          {
            "productId": "ca7a1090-0000-4000-8000-000000000206",
            "qty": 2
          }
        ],
        "priceLabel": "$36.000"
      }
    },
    {
      "slug": "manada-15",
      "name": "Manada −15%",
      "tagline": "Cuatro perros o más: la manada descuenta.",
      "kind": "percent_off",
      "sortOrder": 3,
      "display": {
        "priceLabel": "−15%",
        "eligibleProductIds": [
          "ca7a1090-0000-4000-8000-000000000201",
          "ca7a1090-0000-4000-8000-000000000202",
          "ca7a1090-0000-4000-8000-000000000203",
          "ca7a1090-0000-4000-8000-000000000204",
          "ca7a1090-0000-4000-8000-000000000205",
          "ca7a1090-0000-4000-8000-000000000206"
        ]
      },
      "config": {
        "eligibleProductIds": [
          "ca7a1090-0000-4000-8000-000000000201",
          "ca7a1090-0000-4000-8000-000000000202",
          "ca7a1090-0000-4000-8000-000000000203",
          "ca7a1090-0000-4000-8000-000000000204",
          "ca7a1090-0000-4000-8000-000000000205",
          "ca7a1090-0000-4000-8000-000000000206"
        ],
        "minQty": 4,
        "percent": 15,
        "roundDownTo": 500
      }
    }
  ]
}
```

| Campo | Descripción |
|-------|-------------|
| `categories[].products[]` | Incluye `isAvailable=false` (la app los muestra "agotados") y excluye soft-deleted. Categorías sin productos llegan con `products: []`. |
| `products[].slug` | Clave estable del producto (única, inmutable): mapea el asset local `assets/images/products/<slug>.png` mientras `imageUrl` es `null` y es el segmento de ruta del detalle (`/home/category/<cat>/product/<slug>`). No derivar del `name` editable. |
| `imageUrl` | Imagen primaria del producto; `null` mientras no haya fotos hospedadas (la app usa sus assets locales por convención de slug). |
| `modifierGroups[].slug` | Clave estable del grupo: `ingredients` (adicionar/quitar), `toppings`, `sauces` — no depender del `name` editable. |
| `options[].includedByDefault` | `true` = viene en el producto salvo que el cliente lo quite (por producto). |
| `options[].isRemovable` | `false` = obligatorio (pan, salchicha) — no se desmarca aunque venga por defecto. |
| `options[].extraPrice` | COP como número entero; `0` = gratis (toppings/salsas). |
| `options[].isReplaceable` | `false` = si el ingrediente incluido se agota NO admite cambio por un adicional gratis — el dueño marca el producto agotado (corazón del producto: salchicha, pan). La app solo muestra el ↔ de reemplazo cuando es `true`. |
| `options[].isReplacementEligible` | `false` = la opción no se lista como reemplazo gratis de otra agotada (salchicha — el doble se cobra). La app filtra el picker de reemplazos por este flag. |
| `options[].isEssential` | `true` = ingrediente esencial (salchicha, pan): si una opción **incluida** (`includedByDefault`) con este flag llega `isAvailable=false`, la app deriva el producto entero como agotado — sin él no hay producto que vender. Como extra agotado solo se deshabilita/delista; el `isAvailable` del producto queda como lo dejó el dueño. |
| `promotions[]` | Rail de Combos (§027) — solo ofertas **activas**, ordenadas por `sortOrder`. `[]` si no hay ninguna activa. |
| `promotions[].kind` | `fixed_bundle` (precio cerrado por set) · `free_item` (regalo por umbral de elegibles) · `percent_off` (−N% sobre líneas elegibles) · `showcase` (card presentacional — su oferta la cubre otra promo real; la app NO arma regla con ella). |
| `promotions[].display.priceLabel` | Texto del precio/oferta ya formateado: `"$17.000"` (bundle), `"desde $28.000"` (free_item = minQty × elegible ordenable más barato), `"−15%"` (percent_off) o el literal del showcase. `null` si no se pudo derivar. |
| `promotions[].display.componentProductIds` | En `fixed_bundle`/`showcase`: unidades para armar el carrito — el productId se **repite por qty** (`[depredador, depredador]` = 2 unidades). |
| `promotions[].display.eligibleProductIds` | En `free_item`/`percent_off`: los productos que cuentan para la regla (la app los marca "suman a la promo"). |
| `promotions[].display.freeProductId` | En `free_item`: el producto que sale gratis al cumplir la regla. |
| `promotions[].config` | Configuración **cruda** de la regla (jsonb) — `items[]`/`price` en bundle y showcase, `eligibleProductIds`/`minQty`/`maxQty`/`freeProductId`/`freeQty` en free_item, `eligibleProductIds`/`minQty`/`percent`/`roundDownTo` en percent_off. Es lo que el evaluador local del carrito necesita para el preview; `display` es solo para pintar la card. El servidor re-valida igual — `config` nunca se confía al cliente para el total. |

## Notas

- La **integridad de disponibilidad** la re-valida `orders` al crear el
  pedido (un ingrediente puede agotarse entre cargar el menú y ordenar);
  este endpoint solo da el estado fresco al momento de la llamada.
- `isAvailable` existe a nivel producto Y opción — apagar una opción la
  apaga en TODO el menú (catálogo compartido).
- `promotions[]` es solo **presentación** del rail — la evaluación real
  ocurre server-side al crear el pedido (`POST /orders` responde
  `discount` + `appliedPromotions`); la app puede previsualizar pero el
  servidor siempre decide.
