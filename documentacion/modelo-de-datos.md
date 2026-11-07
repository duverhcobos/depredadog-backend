# Modelo de Datos — Depredadog

Documento vivo del modelo de datos del producto. Es la **fuente diseñada, no la ley** — ver skill `modelo-evolucion`: si la implementación descubre algo que este documento no cubre, la desviación se propone, se aprueba y este archivo se actualiza en la misma propuesta.

## Contexto del producto

- **Negocio**: comida rápida, un solo negocio (single-tenant — sin `tenant_id` ni RLS).
- **Actores**: clientes finales + administrador (el dueño opera todo, incluido el delivery).
- **Canales de venta**: online desde la app + presencial en el local (mesas).
- **Entrega**: retiro en local y/o delivery hecho por el administrador.
- **Pagos**: pago online (pasarela) y pago al recibir/retirar.

## Convenciones del modelo

- Tablas en `snake_case` plural; columnas `snake_case`; identificadores en inglés.
- PK `uuid` (`gen_random_uuid()`), timestamps `timestamptz`.
- `created_at` / `updated_at` en todas las tablas de negocio; `deleted_at` solo donde el soft delete tenga justificación.
- Enums de negocio como tipo `enum` de Postgres (no `varchar` libre).
- Índices definidos junto a cada tabla, pensando en el listado que los usa (ver `listados-paginacion-indices`).

---

## Módulo `auth` — aprobado

Identidad, perfil, dispositivos y tokens de sesión/verificación.

### `users`

Identidad + perfil. Un solo `users` para cliente y admin — dos roles fijos no justifican tabla `roles`.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | `gen_random_uuid()` |
| `email` | citext UNIQUE | NOT NULL | Case-insensitive |
| `password_hash` | varchar(255) | NULL | NULL si la cuenta es solo-Google |
| `google_id` | varchar(255) UNIQUE | NULL | Login/vinculación con Google |
| `role` | enum `user_role` | NOT NULL, default `customer` | `customer` \| `admin` |
| `status` | enum `user_status` | NOT NULL, default `pending_verification` | `pending_verification` \| `active` \| `suspended` |
| `email_verified_at` | timestamptz | NULL | Obligatorio para usar la app |
| `first_name` | varchar(100) | NOT NULL | Primer nombre |
| `second_name` | varchar(100) | NULL | Segundo nombre |
| `first_last_name` | varchar(100) | NOT NULL | Primer apellido |
| `second_last_name` | varchar(100) | NULL | Segundo apellido |
| `phone` | varchar(20) | NULL | Contacto para delivery. **Sin verificación OTP** — fricción injustificada para el producto |
| `registered_ip` | inet | NULL | Señal anti-fraude: velocidad de registros por IP |
| `referral_code` | varchar(20) UNIQUE | NOT NULL | Código propio para referir — generado al registrar |
| `referred_by` | uuid FK → `users` | NULL | Quién lo refirió (auto-referencia). Base del programa de referidos |
| `marketing_opt_in` | boolean | NOT NULL, default false | Consentimiento explícito para email/push promocional |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |
| `deleted_at` | timestamptz | NULL | Soft delete — conserva historial de pedidos |

Índices: `UNIQUE(email)`, `UNIQUE(google_id)`, `UNIQUE(referral_code)`, `INDEX(status)` (listados admin por estado), `INDEX(referred_by)` (contar referidos de un usuario).

### `addresses`

Direcciones reutilizables del cliente (delivery).

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `user_id` | uuid FK → `users` ON DELETE CASCADE | NOT NULL | |
| `label` | varchar(50) | NOT NULL | "Casa", "Trabajo" |
| `landmark` | varchar(255) | NOT NULL | Punto de referencia — ES la dirección (§022a: la zona no tiene nomenclatura de calles) |
| `neighborhood` | text | NULL | Barrio/vereda/sector (§022a) |
| `type` | enum `address_type` | NOT NULL, default `other` | `home` \| `work` \| `other` — ícono en la app (§022b) |
| `latitude` | numeric(9,6) | NULL | Opcional, para mapa/delivery |
| `longitude` | numeric(9,6) | NULL | |
| `is_default` | boolean | NOT NULL, default false | Máx. una por usuario |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |

Índices: `INDEX(user_id)`, índice parcial `UNIQUE(user_id) WHERE is_default` (una default por usuario).

**Decisión (§014/§022a)**: el esquema evolucionó en la propuesta 014 — `address_line` → `landmark`, `reference` → `neighborhood`, + columna `type`. Borrar una dirección es real (sin soft delete): `orders.address_id` queda `NULL` (`ON DELETE SET NULL`) y la orden conserva su `delivery_address` como snapshot inmutable. Máx. 10 por usuario (regla de aplicación); la primera queda default automática y, si se borra la default, la más antigua la hereda.

### `devices`

Huella del dispositivo — señal anti-fraude pasiva y sesiones por dispositivo.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `user_id` | uuid FK → `users` ON DELETE CASCADE | NOT NULL | |
| `fingerprint` | varchar(255) | NOT NULL | ID que sobrevive reinstall: `ANDROID_ID` en Android; UUID en Keychain en iOS (vía `flutter_secure_storage`) |
| `platform` | varchar(20) | NULL | `android` \| `ios` |
| `push_token` | varchar(255) | NULL | Token FCM/APNs — rota, se actualiza; se limpia si el proveedor lo reporta inválido |
| `notifications_enabled` | boolean | NOT NULL, default true | Preferencia de push del usuario |
| `created_at` | timestamptz | NOT NULL | |
| `last_seen_at` | timestamptz | NOT NULL | |

Índices: `UNIQUE(user_id, fingerprint)`, `INDEX(fingerprint)` — la consulta anti-fraude busca el fingerprint **entre todos los usuarios**, no solo el actual.

### `auth_tokens`

Verificación de email y reset de contraseña en una sola tabla — mismo ciclo de vida.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `user_id` | uuid FK → `users` ON DELETE CASCADE | NOT NULL | |
| `token_hash` | varchar(255) | NOT NULL | Nunca el token plano |
| `type` | enum `auth_token_type` | NOT NULL | `email_verification` \| `password_reset` |
| `expires_at` | timestamptz | NOT NULL | |
| `consumed_at` | timestamptz | NULL | Single-use |
| `created_at` | timestamptz | NOT NULL | |

Índices: `INDEX(token_hash)` (lookup al consumir), `INDEX(user_id, type)`.

### `refresh_tokens`

Sesión persistente revocable; rotación por uso.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `user_id` | uuid FK → `users` ON DELETE CASCADE | NOT NULL | |
| `device_id` | uuid FK → `devices` | NULL | Habilita "cerrar sesión en todos los dispositivos" |
| `token_hash` | varchar(255) UNIQUE | NOT NULL | Rotación: cada refresh emite uno nuevo e invalida el anterior |
| `expires_at` | timestamptz | NOT NULL | |
| `revoked_at` | timestamptz | NULL | |
| `created_at` | timestamptz | NOT NULL | |

Índices: `UNIQUE(token_hash)`, `INDEX(user_id)`, `INDEX(device_id)`.

### Decisiones tomadas (`auth`)

- `password_hash` + `google_id` nullable: una cuenta puede ser solo-email, solo-Google, o email que luego vincula Google.
- `status` separado de `email_verified_at`: `pending_verification` bloquea login; `suspended` permite bloquear clientes desde admin.
- Tokens siempre hasheados — si la BD se filtra, no sirven.
- **Sin verificación OTP de teléfono**: fricción injustificada para una app de comida. `phone` es contacto plano. Si el fraude escala, `phone_verified_at` es migración simple.
- Anti-fraude basado en señales pasivas: `devices.fingerprint`, `registered_ip`, `email_verified_at`, `google_id` único.
- Referidos viven en `users` (`referral_code`, `referred_by`) — la conversión/recompensa se resuelve en `promotions` cuando se modele.
- Push notifications: `devices.push_token` (rota con FCM/APNs) + `notifications_enabled` para la preferencia del usuario.
- `marketing_opt_in` parte en `false` — el consentimiento es explícito en el registro.
- **Nombre en 4 campos** (convención LatAm, propuesta 004): `first_name` + `first_last_name` obligatorios ("Juan Pérez" basta); `second_name` + `second_last_name` opcionales ("Juan Carlos Pérez García"). El segundo apellido no siempre es materno → naming numérico, no paternal/maternal.

---

## Módulo `catalog` — aprobado

Menú: categorías, productos, combos fijos, y personalización por ingredientes/extras vía grupos de modificadores compartidos.

### `categories`

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `name` | varchar(100) | NOT NULL | Perros, Hamburguesas, Bebidas… |
| `slug` | varchar(100) UNIQUE | NOT NULL | Para orden/URLs |
| `description` | text | NULL | |
| `image_url` | varchar(500) | NULL | |
| `is_active` | boolean | NOT NULL, default true | |
| `sort_order` | int | NOT NULL, default 0 | Orden manual del menú |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |

### `products`

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `category_id` | uuid FK → `categories` | NOT NULL | |
| `name` | varchar(150) | NOT NULL | |
| `slug` | varchar(120) UNIQUE | NOT NULL | Clave estable para consumidores: assets, rutas |
| `description` | text | NULL | |
| `base_price` | numeric(10,2) | NOT NULL | Precio exacto en Postgres |
| `is_available` | boolean | NOT NULL, default true | Toggle por producto ("se acabó el pan brioche") |
| `is_combo` | boolean | NOT NULL, default false | |
| `is_featured` | boolean | NOT NULL, default false | Destacado en portada de la app |
| `sort_order` | int | NOT NULL, default 0 | Orden dentro de la categoría |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |
| `deleted_at` | timestamptz | NULL | Soft delete |

Índices: `INDEX(category_id, sort_order)` (listado del menú), `INDEX(is_featured) WHERE is_featured` (portada), `INDEX(is_available)`.

### `product_images`

Galería de 1 a N fotos por producto.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `product_id` | uuid FK → `products` ON DELETE CASCADE | NOT NULL | |
| `image_url` | varchar(500) | NOT NULL | |
| `sort_order` | int | NOT NULL, default 0 | |
| `is_primary` | boolean | NOT NULL, default false | Una por producto |
| `created_at` | timestamptz | NOT NULL | |

Índices: `INDEX(product_id, sort_order)`, índice parcial `UNIQUE(product_id) WHERE is_primary`.

### `combo_items`

Contenido de combos fijos — `combo_id` es el producto-combo, `item_product_id` el componente.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `combo_id` | uuid FK → `products` ON DELETE CASCADE | NOT NULL | El producto con `is_combo=true` |
| `item_product_id` | uuid FK → `products` | NOT NULL | Componente (`is_combo=false`) |
| `quantity` | int | NOT NULL, default 1 | |

Índices/constraints: `UNIQUE(combo_id, item_product_id)`; regla de dominio: combos no anidan combos.

### `modifier_groups`

Grupos de personalización compartidos entre productos: "Ingredientes", "Salsas", "Tamaños".

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `slug` | varchar(50) UNIQUE | NOT NULL | Clave estable para el consumidor: `ingredients`, `toppings`, `sauces` — el nombre es display editable |
| `name` | varchar(100) | NOT NULL | |
| `min_select` | int | NOT NULL, default 0 | 1 = elección obligatoria (ej. tamaño) |
| `max_select` | int | NULL | NULL = sin límite; 3 = "elige máx 3 salsas" |
| `sort_order` | int | NOT NULL, default 0 | Orden de despliegue del grupo en el menú (global — mismo orden para todo el menú) |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |

### `modifier_options`

Catálogo compartido de ingredientes y extras — una opción sirve a todos los productos que la usan.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `group_id` | uuid FK → `modifier_groups` ON DELETE CASCADE | NOT NULL | |
| `name` | varchar(100) | NOT NULL | Cebolla, queso extra, salsa rosada… |
| `extra_price` | numeric(10,2) | NOT NULL, default 0 | 0 = incluido; >0 = extra pago |
| `is_removable` | boolean | NOT NULL, default true | false = obligatorio (el pan) |
| `is_available` | boolean | NOT NULL, default true | Toggle por ingrediente — apaga en TODO el menú |
| `is_replaceable` | boolean | NOT NULL, default true | false = si se agota incluida NO admite cambio gratis — el dueño marca el producto agotado (corazón: salchicha, pan) |
| `is_replacement_eligible` | boolean | NOT NULL, default true | false = no se ofrece como reemplazo gratis de otra opción agotada (salchicha y desmechadas — se cobran, no se regalan) |
| `is_essential` | boolean | NOT NULL, default false | true = ingrediente esencial: si se agota estando incluido, el producto entero queda agotado (salchicha, pan — sin ellos no hay producto que vender) |
| `sort_order` | int | NOT NULL, default 0 | |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |

Índices: `INDEX(group_id, sort_order)`, `INDEX(is_available)` (filtro global de disponibilidad).

### `product_modifier_groups`

Qué grupos de modificadores aplica a cada producto.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `product_id` | uuid FK → `products` ON DELETE CASCADE | NOT NULL | |
| `group_id` | uuid FK → `modifier_groups` ON DELETE CASCADE | NOT NULL | |

Constraint: `PRIMARY KEY (product_id, group_id)` (tabla puente sin id propio).

### `product_modifier_options`

Qué opciones vienen **por defecto en cada producto** — evolución del
modelo: `included_by_default` NO es global en `modifier_options` porque
la misma opción puede ser default en un producto y extra en otro
(mozzarella: default en El Cachorro, adicional en El Coyote). La tabla
es *sparse*: solo existen filas de opciones incluidas por defecto; el
resto de opciones del grupo enlazado se ofrece como adicional.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `product_id` | uuid FK → `products` ON DELETE CASCADE | NOT NULL | |
| `option_id` | uuid FK → `modifier_options` ON DELETE CASCADE | NOT NULL | |
| `included_by_default` | boolean | NOT NULL, default true | Reservado: false = la fila marca opción disponible-pero-nunca-default (futura exclusión por producto) |
| `sort_order` | int | NOT NULL, default 0 | Orden de la opción en este producto |

Constraint: `PRIMARY KEY (product_id, option_id)`.

### Decisiones tomadas (`catalog`)

- **Un solo mecanismo de personalización**: `product_modifier_options.included_by_default` (por producto) + `is_removable` + `extra_price` cubren "quítale la cebolla" (incluida por defecto, removible, $0), "el pan obligatorio" (default + no removible), "queso extra +$2" (no incluido, precio>0) y "máx 3 salsas" (`max_select` del grupo).
- **Ingredientes compartidos**: las opciones viven en `modifier_options`, no por producto — apagar `is_available` la desactiva en todo el menú de una vez.
- **Combos = producto con `is_combo=true`** + `combo_items`; no anidan. El precio del combo es `base_price` del producto-combo.
- **Regla del cambio gratis** (propuestas 010-011): si un ingrediente incluido se agota, el cliente puede cambiarlo por UN adicional sin costo — acotada con tres flags globales de la opción: `is_replaceable` (¿admite ser cambiada? false en el corazón del producto — si la salchicha se agota no hay perro que vender, el dueño marca el producto agotado), `is_replacement_eligible` (¿puede regalarse como reemplazo? false en la salchicha — el doble se cobra) e `is_essential` (¿si se agota tumba el producto? true en salchicha y pan — distinto de `is_replaceable=false`: la mozzarella no se cambia pero el perro se sigue vendiendo sin queso; sin salchicha no hay producto). **Globales, no por producto**: `product_modifier_options` es *sparse* (solo filas de opciones incluidas) y los candidatos del picker son extras **sin fila** en la junction — su elegibilidad no puede vivir ahí; además "la salchicha no se regala" es verdad del ingrediente, no del producto. Si un caso por producto aparece, la junction puede pisarlo después. **Derivación** (la hace el consumidor — la app ya recibe las opciones): producto agotado efectivo = `!is_available` del producto O alguna opción incluida (`included_by_default`) con `is_essential && !is_available`; el backend solo expone el flag — el `is_available` del producto queda como lo dejó el dueño.
- **Horario del local no va aquí** — pertenece a `store`; `orders` valida contra él.
- Fotos: galería con `is_primary` (índice parcial único).

---

## Módulo `store` — aprobado

Configuración del negocio (una sola fila), horario de atención y mesas del local.

### `store_settings`

Una fila — configuración global del negocio (single-tenant).

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `name` | varchar(150) | NOT NULL | "Depredadog" |
| `phone` | varchar(20) | NULL | |
| `address` | varchar(255) | NULL | Dirección del local |
| `logo_url` | varchar(500) | NULL | |
| `delivery_fee` | numeric(10,2) | NOT NULL, default 0 | Costo fijo de envío |
| `min_delivery_order` | numeric(10,2) | NULL | Compra mínima para delivery |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |

### `business_hours`

Un rango de atención por día de semana.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `day_of_week` | smallint | NOT NULL | 0–6, `CHECK (day_of_week BETWEEN 0 AND 6)` |
| `opens_at` | time | NOT NULL | |
| `closes_at` | time | NOT NULL | `closes_at < opens_at` = cruza medianoche (18:00→02:00) |
| `is_closed` | boolean | NOT NULL, default false | Día cerrado |

Constraint: `UNIQUE(day_of_week)` — un rango por día.

### `tables`

Mesas del local — mínimas, el pedido presencial las referencia.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `label` | varchar(20) UNIQUE | NOT NULL | "Mesa 1", "Barra" |
| `is_active` | boolean | NOT NULL, default true | |
| `created_at` | timestamptz | NOT NULL | |

### Decisiones tomadas (`store`)

- **`store_settings` = una fila** — negocio único; no tabla key-value.
- **Horario por día** con un solo rango; `closes_at < opens_at` indica horario que cruza medianoche (comida rápida nocturna).
- **Sin override manual** de "cerrado ahora" — si hace falta, es un boolean aquí en migración futura.
- **Mesas mínimas** (label + activa). Pedido presencial lo registra el admin — sin QR ni pedido invitado.
- **Delivery = costo fijo** en `delivery_fee`, sin zonas. `min_delivery_order` propuesto para evitar envíos por montos ridículos.

---

## Módulo `orders` — aprobado

Pedidos con canal dual (online/presencial), ítems con snapshot de precios, modificadores en filas hijas.

### `orders`

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `order_date` | date | NOT NULL | Día de negocio en la tz del local (la escribe la app al crear el pedido) — base del reset diario del consecutivo |
| `order_number` | int | NOT NULL | Ticket legible — secuencial diario por `order_date` ("pedido #15") |
| `channel` | enum `order_channel` | NOT NULL | `online` \| `presencial` — quién lo creó |
| `service_type` | enum `order_service_type` | NOT NULL | `pickup` \| `delivery` \| `dine_in` — cómo se consume |
| `customer_id` | uuid FK → `users` | NULL | NULL en presencial (cliente sin cuenta) |
| `taken_by` | uuid FK → `users` | NULL | Admin que lo registró (presencial) |
| `table_id` | uuid FK → `tables` | NULL | `dine_in`: mesa asignada por el admin |
| `address_id` | uuid FK → `addresses` ON DELETE SET NULL | NULL | `delivery`: dirección elegida del cliente — se suelta si se borra (§014), el snapshot está en `delivery_address` |
| `delivery_address` | text | NULL | Snapshot inmutable de la dirección al pedir |
| `status` | enum `order_status` | NOT NULL, default `pending` | `pending` → `confirmed` → `preparing` → `done`; `cancelled` en cualquier punto |
| `subtotal` | numeric(10,2) | NOT NULL | |
| `delivery_fee` | numeric(10,2) | NOT NULL, default 0 | Snapshot del fee al momento del pedido |
| `discount` | numeric(10,2) | NOT NULL, default 0 | Lo llena `promotions` |
| `total` | numeric(10,2) | NOT NULL | |
| `notes` | text | NULL | "Timbre roto", "sin picante" |
| `contact_phone` | varchar(20) | NULL | Quién recibe el pedido — la app lo exige en delivery (§024); NULL en pickup/presencial |
| `cancel_reason` | text | NULL | |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |

Constraints/índices (implementado, propuesta 013): `UNIQUE(order_date, order_number)` (consecutivo diario por día de negocio), `INDEX(status, created_at)` (cola de cocina), `INDEX(customer_id, created_at)` (historial del cliente), índice parcial `INDEX(table_id) WHERE status NOT IN ('done','cancelled')` (mesa ocupada).

### `order_items`

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `order_id` | uuid FK → `orders` ON DELETE CASCADE | NOT NULL | |
| `product_id` | uuid FK → `products` | NOT NULL | Referencia (puede ser combo) |
| `product_name` | varchar(150) | NOT NULL | Snapshot — el producto puede renombrarse |
| `unit_price` | numeric(10,2) | NOT NULL | Snapshot |
| `quantity` | int | NOT NULL | |
| `line_total` | numeric(10,2) | NOT NULL | (precio + extras) × qty — snapshot |
| `notes` | text | NULL | Nota del ítem |

Índices: `INDEX(order_id)`, `INDEX(product_id)` (reportes "más vendidos").

### `order_item_modifiers`

Modificadores elegidos por ítem — filas hijas, consultables para reportes y comanda.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `order_item_id` | uuid FK → `order_items` ON DELETE CASCADE | NOT NULL | |
| `option_id` | uuid FK → `modifier_options` | NULL | Referencia; sobrevive si la opción se borra |
| `option_name` | varchar(100) | NOT NULL | Snapshot |
| `action` | enum `modifier_action` | NOT NULL | `added` \| `removed` ("sin cebolla" = removed) |
| `price_delta` | numeric(10,2) | NOT NULL, default 0 | Snapshot del extra cobrado |

Índices: `INDEX(order_item_id)`, `INDEX(option_id)` (reportes por ingrediente).

### Decisiones tomadas (`orders`)

- **Flujo corto**: `pending → confirmed → preparing → done` + `cancelled`. Sin `out_for_delivery` — el delivery lo hace el admin.
- **Mesa = atributo del pedido**: el admin toma el pedido y asigna `table_id`; sin "cuenta abierta" — si la mesa pide algo más, es otro pedido a la misma mesa.
- **Snapshots en ítems** (`product_name`, `unit_price`, `option_name`, `price_delta`) y en la orden (`delivery_fee`, `delivery_address`): renombrar productos o editar direcciones no altera el histórico.
- **`channel` ≠ `service_type`**: canal = quién lo creó (app vs admin); servicio = cómo se consume. Cubre "pedido por teléfono para recoger" (`presencial` + `pickup`).
- **Modificadores en filas hijas** (no jsonb): reportes por ingrediente y comanda limpia.
- **Sin propina**. El estado de pago se decide en `payments` (columna aquí vs tabla propia).
- `order_number` secuencial diario **implementado** (propuesta 013): columna `order_date` + `UNIQUE(order_date, order_number)` — el reset diario quedó por día de negocio en la tz del local.
- **Teléfonos del pedido** (`orders.contact_phone`, `payments.payer_phone`) — decisión §024: quién recibe vive en la orden (delivery lo exige); quién paga vive en el pago. En efectivo quien recibe = quien paga.

---

## Módulo `payments` — aprobado

Pagos por pedido: efectivo, transferencia manual y pasarela online, con reembolso registrado.

### `payments`

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `order_id` | uuid FK → `orders` | NOT NULL | 1:N — reintentos quedan en historial |
| `method` | enum `payment_method` | NOT NULL | `cash` \| `transfer` \| `gateway` |
| `status` | enum `payment_status` | NOT NULL, default `pending` | `pending` \| `paid` \| `failed` \| `refunded` |
| `amount` | numeric(10,2) | NOT NULL | |
| `provider` | varchar(50) | NULL | 'mercadopago', 'wompi'… varchar a propósito (nueva pasarela ≠ migración) |
| `provider_reference` | varchar(255) | NULL | Id de transacción externa |
| `provider_payload` | jsonb | NULL | Respuesta cruda del webhook — auditoría |
| `evidence_url` | varchar(500) | NULL | Comprobante de transferencia |
| `payer_phone` | varchar(20) | NULL | Celular que recibe el push Nequi en `transfer` — quién paga (§024); NULL en `cash`/`gateway` |
| `confirmed_by` | uuid FK → `users` | NULL | Admin que confirmó efectivo/transferencia |
| `confirmed_at` | timestamptz | NULL | |
| `refunded_at` | timestamptz | NULL | |
| `refund_reason` | text | NULL | |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |

Índices: `INDEX(order_id)`, `INDEX(status, created_at)` (cola de pagos por confirmar), índice parcial `UNIQUE(order_id) WHERE status IN ('pending','paid')` (un solo pago vivo por orden).

### Decisiones tomadas (`payments`)

- **Estado del pago vive aquí**, no en `orders` — una sola fuente de verdad.
- **Pago al pedir**: orden nace `pending` + payment `pending`; webhook/confirmación → `confirmed` o `cancelled` si el pago falla.
- `cash`: `pending` hasta que el admin lo marca `paid`. `transfer`: `evidence_url` + confirmación manual. `gateway`: webhook del proveedor.
- **Reembolso registrado** (`refunded` + razón): en pasarela vía API, en efectivo/transferencia se resuelve manual fuera y solo se documenta.

---

## Módulo `promotions` — aprobado

Cupones con código, descuentos automáticos, bono de bienvenida por dispositivo, programa de referidos y segmentación por perfil.

### `promotions`

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `name` | varchar(150) | NOT NULL | "20% perros finde" |
| `description` | text | NULL | |
| `kind` | enum `promotion_kind` | NOT NULL | `coupon` \| `automatic` \| `welcome` \| `referral` |
| `reward_type` | enum `reward_type` | NOT NULL | `percent` \| `fixed_amount` \| `free_delivery` |
| `reward_value` | numeric(10,2) | NULL | 20 = %, 5000 = monto; NULL en `free_delivery` |
| `code` | varchar(50) UNIQUE | NULL | "PERRO10" — solo `kind=coupon` |
| `segment` | enum `promo_segment` | NOT NULL, default `all` | `all` \| `new` \| `inactive` \| `frequent` |
| `segment_param` | int | NULL | `inactive`+30 = 30 días sin pedir; `frequent`+10 = 10+ pedidos |
| `applies_to` | enum `promo_scope` | NOT NULL, default `order` | `order` \| `product` \| `category` |
| `min_order_amount` | numeric(10,2) | NULL | Compra mínima para aplicar |
| `starts_at` / `ends_at` | timestamptz | NULL | Vigencia |
| `max_uses_total` | int | NULL | Tope global de redenciones |
| `max_uses_per_user` | int | NOT NULL, default 1 | "1 por cliente" |
| `is_active` | boolean | NOT NULL, default true | |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |

Índices: `INDEX(code)`, `INDEX(is_active, starts_at, ends_at)` (promos vigentes), `INDEX(segment)`.

### `promotion_targets`

Scope de producto/categoría — solo se llena si `applies_to` no es `order`.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `promotion_id` | uuid FK → `promotions` ON DELETE CASCADE | NOT NULL | |
| `product_id` | uuid FK → `products` | NULL | |
| `category_id` | uuid FK → `categories` | NULL | `CHECK`: exactamente uno de los dos |

Índices: `INDEX(promotion_id)`, `INDEX(product_id)`, `INDEX(category_id)`.

### `user_promotions`

Billetera de promos otorgadas al usuario (referidos, bonos, regalos del admin).

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `user_id` | uuid FK → `users` | NOT NULL | |
| `promotion_id` | uuid FK → `promotions` | NOT NULL | |
| `source` | enum `promo_source` | NOT NULL | `welcome` \| `referral` \| `admin_grant` |
| `status` | enum `user_promo_status` | NOT NULL, default `available` | `available` \| `redeemed` \| `expired` |
| `redeemed_order_id` | uuid FK → `orders` | NULL | |
| `created_at` / `redeemed_at` | timestamptz | NOT NULL / NULL | |

Índices: `INDEX(user_id, status)` (billetera del cliente), `UNIQUE(user_id, promotion_id, source)` donde aplique.

### `promotion_redemptions`

Auditoría de cada uso — incluye la huella del dispositivo para la regla anti-fraude.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `promotion_id` | uuid FK → `promotions` | NOT NULL | |
| `user_id` | uuid FK → `users` | NOT NULL | |
| `order_id` | uuid FK → `orders` | NOT NULL | |
| `device_fingerprint` | varchar(255) | NULL | Regla "1 por dispositivo" del bono welcome |
| `amount_discounted` | numeric(10,2) | NOT NULL | Cuánto descontó realmente |
| `created_at` | timestamptz | NOT NULL | |

Índices: `INDEX(promotion_id)` (conteo de usos vs `max_uses_total`), `INDEX(user_id, promotion_id)` (tope por usuario), `INDEX(device_fingerprint)` (anti-fraude welcome).

### `referrals`

Ciclo de vida del referido — complementa `users.referred_by` con estado y conversión.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `referrer_id` | uuid FK → `users` | NOT NULL | Quien invitó |
| `referred_id` | uuid FK → `users` UNIQUE | NOT NULL | Quien se registró — un solo referrer |
| `status` | enum `referral_status` | NOT NULL, default `registered` | `registered` → `converted` → `rewarded` |
| `reward_promotion_id` | uuid FK → `promotions` | NULL | Promo `kind=referral` que premia ambos lados |
| `converted_order_id` | uuid FK → `orders` | NULL | El primer pedido que lo convirtió |
| `created_at` / `converted_at` | timestamptz | NOT NULL / NULL | |

Índices: `INDEX(referrer_id, status)` ("mis referidos"), `INDEX(status)` (pendientes de recompensa).

### Decisiones tomadas (`promotions`)

- **Bono de bienvenida**: `kind=welcome` + validación de `promotion_redemptions.device_fingerprint` — **1 por dispositivo, canjeable en el primer pedido**.
- **Referidos**: `referred` completa primer pedido → `converted` → se insertan `user_promotions` a **ambos** lados → `rewarded`.
- **1 promo por pedido** — sin stacking; `orders.discount` materializa el descuento elegido.
- **Premios**: `%`, monto fijo, envío gratis (sin producto gratis/2x1 por ahora).
- **Segmentación por lista cerrada** (`segment` + `segment_param` por promo) — los umbrales se definen por promo, no config global.
- `automatic` aplica sola en checkout (happy hour = `applies_to` + ventana de vigencia); `coupon` exige código.

---

## Módulo `loyalty` — aprobado

Puntos por monto de compra (canjeables por productos) + sellos por producto (N compras → premio), sin caducidad y con canje a decisión del cliente.

### `loyalty_accounts`

Saldo por cliente — una fila por usuario con actividad.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `user_id` | uuid FK → `users` UNIQUE | NOT NULL | |
| `points_balance` | int | NOT NULL, default 0 | Cache del ledger |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |

### `point_movements`

Ledger de puntos — ganados por compra, gastados en canje, ajustes manuales del admin.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `user_id` | uuid FK → `users` | NOT NULL | |
| `order_id` | uuid FK → `orders` | NULL | Pedido que originó el movimiento |
| `delta` | int | NOT NULL | +ganados, −canjeados |
| `reason` | enum `points_reason` | NOT NULL | `earned` \| `redeemed` \| `adjusted` |
| `created_at` | timestamptz | NOT NULL | |

Índices: `INDEX(user_id, created_at)` (extracto de puntos), `INDEX(order_id)` (idempotencia al acreditar).

### `loyalty_rewards`

Catálogo de premios canjeables por puntos.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `product_id` | uuid FK → `products` | NOT NULL | Lo que se lleva gratis |
| `points_cost` | int | NOT NULL | 500 pts = perro gratis |
| `is_active` | boolean | NOT NULL, default true | |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |

### `stamp_programs`

Programas de sellos — "10 perros = 1 perro gratis".

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `name` | varchar(100) | NOT NULL | |
| `product_id` | uuid FK → `products` | NULL | Scope: un producto… |
| `category_id` | uuid FK → `categories` | NULL | …o toda la categoría (`CHECK`: exactamente uno) |
| `stamps_required` | int | NOT NULL | Sellos para completar |
| `reward_product_id` | uuid FK → `products` | NOT NULL | Premio |
| `is_active` | boolean | NOT NULL, default true | |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |

### `stamp_cards`

Progreso del cliente por programa.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `user_id` | uuid FK → `users` | NOT NULL | |
| `program_id` | uuid FK → `stamp_programs` | NOT NULL | |
| `stamps` | int | NOT NULL, default 0 | Sellos en la tarjeta actual |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |

Índices: `UNIQUE(user_id, program_id)`, `INDEX(program_id)`.

### `stamp_movements`

Qué ítem generó sellos — `order_item_id` único garantiza anti-duplicado.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `user_id` | uuid FK → `users` | NOT NULL | |
| `program_id` | uuid FK → `stamp_programs` | NOT NULL | |
| `order_item_id` | uuid FK → `order_items` UNIQUE | NOT NULL | Un ítem suma una sola vez |
| `quantity` | int | NOT NULL | 3 perros en el ítem = 3 sellos |
| `created_at` | timestamptz | NOT NULL | |

Índices: `INDEX(user_id, program_id, created_at)`.

### `loyalty_redemptions`

Premios ganados pendientes de canjear — **el cliente decide cuándo** (billetera de premios).

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `user_id` | uuid FK → `users` | NOT NULL | |
| `reward_id` | uuid FK → `loyalty_rewards` | NULL | Si vino de puntos |
| `stamp_card_id` | uuid FK → `stamp_cards` | NULL | Si vino de sellos (CHECK: uno de los dos) |
| `product_id` | uuid FK → `products` | NOT NULL | Premio a llevar gratis |
| `status` | enum `redemption_status` | NOT NULL, default `available` | `available` \| `redeemed` |
| `order_id` | uuid FK → `orders` | NULL | Pedido donde se canjeó |
| `created_at` / `redeemed_at` | timestamptz | NOT NULL / NULL | |

Índices: `INDEX(user_id, status)` (billetera del cliente).

### Decisiones tomadas (`loyalty`)

- **Puntos por monto**: pedido `done` acredita según tasa configurable (ej. `points_per_amount` en `store_settings`); `point_movements` es el ledger, `points_balance` el cache.
- **Canje por productos** (no descuento en dinero): `loyalty_rewards` define el catálogo de premios.
- **Sellos por producto**: cada ítem suma `quantity` sellos al programa en scope; al llegar a `stamps_required` la tarjeta se completa, genera `loyalty_redemptions` `available` y reinicia.
- **Anti-duplicado**: `stamp_movements.order_item_id` UNIQUE — ni retries ni reembolsos duplican sellos.
- **Sin caducidad** de puntos ni sellos.
- Premio canjeado → ítem del pedido en $0 al aplicar la redención.

---

## Módulo `notifications` — aprobado

Campañas push/email con audiencias (todos/segmento/puntuales), bandeja in-app por usuario, y banners promocionales con link opcional.

### `campaigns`

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `title` | varchar(150) | NOT NULL | Título del push / asunto del email |
| `body` | text | NOT NULL | |
| `channel` | enum `campaign_channel` | NOT NULL | `push` \| `email` \| `both` |
| `audience` | enum `campaign_audience` | NOT NULL | `all` \| `segment` \| `users` |
| `segment` | enum `promo_segment` | NULL | Reutiliza `all`/`new`/`inactive`/`frequent` — solo si audience=segment |
| `segment_param` | int | NULL | Umbral del segmento (días inactivo, N pedidos) |
| `scheduled_at` | timestamptz | NULL | NULL = envío inmediato |
| `status` | enum `campaign_status` | NOT NULL, default `draft` | `draft` \| `scheduled` \| `sent` |
| `created_by` | uuid FK → `users` | NOT NULL | Admin que la creó |
| `sent_at` | timestamptz | NULL | |
| `created_at` | timestamptz | NOT NULL | |

Índices: `INDEX(status, scheduled_at)` (cron de envíos programados).

### `campaign_recipients`

Destinatarios puntuales — solo se llena si `audience=users`.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `campaign_id` | uuid FK → `campaigns` ON DELETE CASCADE | NOT NULL | |
| `user_id` | uuid FK → `users` | NOT NULL | |

Constraint: `PRIMARY KEY (campaign_id, user_id)`.

### `notifications`

Bandeja in-app por usuario — campañas y transaccionales conviven aquí.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `user_id` | uuid FK → `users` ON DELETE CASCADE | NOT NULL | |
| `campaign_id` | uuid FK → `campaigns` | NULL | NULL = transaccional |
| `kind` | enum `notification_kind` | NOT NULL | `promo` \| `order_update` \| `system` |
| `title` | varchar(150) | NOT NULL | |
| `body` | text | NOT NULL | |
| `data` | jsonb | NULL | Deep link, ej. `{"order_id": "…"}` |
| `read_at` | timestamptz | NULL | |
| `created_at` | timestamptz | NOT NULL | |

Índices: `INDEX(user_id, read_at)` (bandeja: no leídas primero), `INDEX(user_id, created_at)` (historial).

### `banners`

Carrusel promocional de la app con link opcional.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `id` | uuid PK | | |
| `title` | varchar(150) | NULL | |
| `image_url` | varchar(500) | NOT NULL | |
| `sort_order` | int | NOT NULL, default 0 | Orden del carrusel |
| `link_type` | enum `banner_link_type` | NULL | `product` \| `category` \| `promotion`; NULL = informativo |
| `link_id` | uuid | NULL | Destino del tap |
| `is_active` | boolean | NOT NULL, default true | |
| `starts_at` / `ends_at` | timestamptz | NULL | Banner programado |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |

Índices: `INDEX(is_active, starts_at, ends_at)` (banners visibles ahora), `INDEX(sort_order)`.

### Decisiones tomadas (`notifications`)

- **Bandeja in-app**: toda notificación es fila en `notifications` con `read_at`; las transaccionales (`order_update`) se generan al cambiar estado del pedido con `data.order_id` para deep link.
- **3 audiencias de campaña**: `all` / `segment` (reutiliza `promo_segment`) / `users` (`campaign_recipients`).
- **El envío físico es externo**: push por `devices.push_token` (FCM), email a quienes tienen `marketing_opt_in` — `notifications` es el registro in-app.
- **Banners con link polimórfico simple** (`link_type` + `link_id`) — suficiente para 3 destinos; sin link = informativo.
- Métricas de apertura fuera del MVP — `read_at` ya permite tasa de apertura básica si se necesita.

---

## Decisiones pendientes para otros módulos

- **`promotions`** — mecánicas confirmadas: cupones con código, descuentos automáticos por regla (happy hour, % por categoría, 2x1), programa de referidos (recompensa a ambos lados al convertir), y la regla ya aprobada de **bono de bienvenida: 1 por `devices.fingerprint`, canjeable en el primer pedido**. Promos **segmentadas por perfil**: elegibilidad derivable de datos (nuevo, inactivo X días, frecuente, primer pedido) — el módulo debe modelar criterios de segmento, no flags manuales por usuario.
- **`loyalty`** — dos mecánicas coexisten: puntos por compra (ledger de movimientos earn/redeem/expire) y sellos (N compras → premio). Se modelan juntas en su módulo.
- **`notifications`/marketing** — push vía `devices.push_token`, email marketing con `marketing_opt_in`, banners/carrusel promocional en app (tabla de contenido propia). Productos destacados: resuelto con `products.is_featured`.

## Estado del modelo

**Modelo completo v1** — todos los módulos aprobados: `auth`, `catalog`, `store`, `orders`, `payments`, `promotions`, `loyalty`, `notifications`.

Resumen de tablas por módulo:

| Módulo | Tablas |
|---|---|
| `auth` | `users`, `addresses`, `devices`, `auth_tokens`, `refresh_tokens` |
| `catalog` | `categories`, `products`, `product_images`, `combo_items`, `modifier_groups`, `modifier_options`, `product_modifier_groups`, `product_modifier_options` |
| `store` | `store_settings`, `business_hours`, `tables` |
| `orders` | `orders`, `order_items`, `order_item_modifiers` |
| `payments` | `payments` |
| `promotions` | `promotions`, `promotion_targets`, `user_promotions`, `promotion_redemptions`, `referrals` |
| `loyalty` | `loyalty_accounts`, `point_movements`, `loyalty_rewards`, `stamp_programs`, `stamp_cards`, `stamp_movements`, `loyalty_redemptions` |
| `notifications` | `campaigns`, `campaign_recipients`, `notifications`, `banners` |

Siguiente paso: propuestas en `propuestas/` por módulo (ver `propuesta-workflow`) — el implementador las aplica con migraciones (ver `migrations-workflow`).
