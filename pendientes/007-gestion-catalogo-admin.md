# Pendiente: Gestión de catálogo por el dueño (admin CRUD + disponibilidad)

> **Estado: 🔴 PENDIENTE** — el catálogo es read-only; no hay quién lo edite
> **Producto:** backend (módulo `catalog` + rol admin)
> **Bloqueo:** bloqueante — el dueño no puede operar el negocio sin
> actualizar menú ni apagar productos/ingredientes agotados

## Contexto

El módulo `catalog` entrega `GET /catalog` (lectura, JWT). Pero **nadie
puede escribir**: no existe endpoint para

- Crear/editar/desactivar productos y precios.
- Editar opciones de modificadores (toppings, salsas, ingredientes).
- **Toggle `is_available`** — el caso operativo diario: "se acabó la
  tocineta a las 7pm" hoy requeriría un UPDATE manual en la base de datos.
- Editar la composición por defecto de un producto
  (`product_modifier_options`).

Esto es scope del rol **administrador** del roadmap (va después del flujo
cliente completo), pero queda registrado aquí porque es gap de
producción del módulo `catalog`: sin él, la validación de disponibilidad
al ordenar nunca tendrá un productor de cambios — y los WebSockets de
`orders` (diferidos) tampoco tendrían eventos que emitir.

## Qué falta

- Endpoints admin protegidos por rol (`@Roles('admin')`): CRUD de
  categorías/productos/opciones + `PATCH .../availability`.
- Reglas de negocio al editar: producto con pedidos abiertos, opción en
  uso por varios productos, quitar un default.
- (Futuro) emitir evento de invalidación de catálogo por el canal WS de
  `orders` al mutar disponibilidad.

## Criterio de cierre

- El dueño puede crear/editar productos y apagar disponibilidad sin
  tocar la base de datos, y los cambios se reflejan en `GET /catalog`.
