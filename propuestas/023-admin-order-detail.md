# Propuesta 023: `GET /admin/orders/:id` — detalle admin con modificadores

La integración app §038 descubrió un gap: el listado `GET /admin/orders`
manda `modifiers: []` a propósito (payload liviano del kanban), y el repo
`findById` — que SÍ carga ítems + modifiers + address — no tiene endpoint.
La pantalla de detalle admin necesita la comanda completa ("sin cebolla"
es instrucción de cocina, no decoración).

Espejo del detalle del cliente (`GetMyOrderUseCase` → `GET /orders/:id`):
mismo agregado con `findById` pero sin filtro de cliente (el dueño ve
cualquier orden — igual que `findForAdmin`).

| | |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/admin/orders/:id` |
| **Auth** | Bearer + `@Roles('admin')` (RolesGuard del controller, ya vigente) |
| **Response** | `AdminOrderResponseDto` (la misma forma del listado/PATCH/POST — con `modifiers` poblados) |
| **Errores** | 400 UUID inválido · 401 · 403 · 404 `ORDER_NOT_FOUND` |

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/orders/application/use-cases/get-admin-order.use-case.ts` | **nuevo** |
| `src/modules/orders/application/services/orders.service.ts` | + método `getAdminOrder` |
| `src/modules/orders/presentation/controllers/admin-orders.controller.ts` | + `@Get('orders/:id')` tras `listAdmin` |
| `src/modules/orders/orders.module.ts` | + provider `GetAdminOrderUseCase` |
| `src/modules/orders/application/use-cases/get-admin-order.use-case.spec.ts` | **nuevo** |
| `test/admin/admin.e2e-spec.ts` | + bloque e2e del detalle |
| `documentacion/api/admin/008-get-admin-orders-id.md` | **nuevo** |
| `documentacion/api/README.md` | + fila del endpoint en la tabla admin |

---

## 1. `get-admin-order.use-case.ts` (nuevo)

Espejo de `GetMyOrderUseCase` — sin `customerId` en el comando. NOTA de
implementación: `toAdminResponse` firma `(result: AdminOrderResult)` y
necesita `channel`/`tableLabel`/`customerName`, así que el use case
devuelve `AdminOrderResult` (no `Order` crudo) hidratando con
`adminView(order)` — mismo patrón de `UpdateOrderStatusUseCase`/
`ConfirmOrderPaymentUseCase` (inyecta `ORDER_REPOSITORY` +
`STORE_REPOSITORY` + `USER_REPOSITORY`):

```ts
export interface GetAdminOrderCommand {
  orderId: string;
}

// Detalle del dueño: id solo, sin filtro de cliente — el agregado
// completo (ítems + modifiers + address) lo carga findById.
@Injectable()
export class GetAdminOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: IOrderRepository,
    @Inject(STORE_REPOSITORY) private readonly stores: IStoreRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
  ) {}

  async execute(cmd: GetAdminOrderCommand): Promise<AdminOrderResult> {
    const order = await this.orders.findById(cmd.orderId);
    if (!order) throw new OrderNotFoundException();
    return { order, ...(await this.adminView(order)) };
  }
  // adminView privado: channel + tableLabel + customerName
  // (espejo del helper ya existente en update-order-status/confirm-payment)
}
```

## 2. `orders.service.ts` — método nuevo

Tras `listAdmin`, mismo patrón use-case → resultado, mapper → DTO. El
param inyectado se llama `getAdminOrderUseCase` (`getAdminOrder` chocaba
con el método — TS2300; precedente `previewDayCloseUseCase`):

```ts
  async getAdminOrder(orderId: string): Promise<AdminOrderResponseDto> {
    const result = await this.getAdminOrderUseCase.execute({ orderId });
    return this.mapper.toAdminResponse(result);
  }
```

+ import de `GetAdminOrderUseCase` y el parámetro en el constructor
(junto a `listAdminOrders` — seguir el orden de los existentes).

## 3. `admin-orders.controller.ts` — endpoint

Después de `listAdmin` (antes del PATCH), para que la lectura REST quede
agrupada:

```ts
  @Get('orders/:id')
  getAdminOrder(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminOrderResponseDto> {
    return this.ordersService.getAdminOrder(id);
  }
```

Sin guard nuevo ni decoradores extra — el `@Roles('admin')` de clase lo
cubre (mismo criterio IDOR del listado: el dueño ve cualquier orden).

## 4. `orders.module.ts` — provider

```ts
import { GetAdminOrderUseCase } from './application/use-cases/get-admin-order.use-case';
// en providers, tras ListAdminOrdersUseCase:
    GetAdminOrderUseCase,
```

## 5. `get-admin-order.use-case.spec.ts` (nuevo)

- `findById` devuelve Order → execute devuelve la entidad (sin tocar DTO).
- `findById` → null → lanza `OrderNotFoundException`.
- Verifica que el comando pasa `orderId` verbatim al repo.

Espejo del spec de `get-my-order.use-case.spec.ts` (mismo harness de
mocks del repositorio).

## 6. `test/admin/admin.e2e-spec.ts` — bloque nuevo

Dentro del describe admin, tras los casos del listado:

- `GET /admin/orders/:id` con orden sembrada → 200, `id` correcto,
  `items[].modifiers` poblado (el ítem sembrado con modifier lo prueba),
  `deliveryAddressLabel`/`deliveryLandmark`/`deliveryNeighborhood` cuando
  la orden lleva `addressId`, `statusChangedAt` presente.
- `GET /admin/orders/<uuid-random>` → 404 `ORDER_NOT_FOUND`.
- `/admin/orders/no-uuid` → 400.
- Sin token → 401; token de cliente → 403 (misma verificación de rol que
  el listado — el bloque ya tiene el harness de ambos casos).
- El ítem sembrado SIN modifiers devuelve `modifiers: []`.

## 7. `documentacion/api/admin/008-get-admin-orders-id.md` (nuevo)

Formato estándar de la carpeta: qué es (detalle del dueño — la comanda
completa con modifiers; el listado los manda vacíos a propósito), tabla
método/ruta/auth/rol/implementado (023), params (`id` uuid), response 200
JSON real (misma forma del 001 pero con `modifiers` poblado + nota de que
`address` desglosa igual que el listado), errores 400/401/403/404.
Nota: úsese al abrir el detalle — el listado es para las cards.

## 8. `documentacion/api/README.md` — fila

Entre la fila de `GET /admin/orders` y `PATCH …/status`:
`GET /admin/orders/:id` → `admin/008-get-admin-orders-id.md` — Detalle
del dueño con comanda completa (modifiers).

---

## Orden de aplicación

1. `get-admin-order.use-case.ts` + spec
2. `orders.service.ts` + `orders.module.ts`
3. `admin-orders.controller.ts`
4. e2e en `test/admin/admin.e2e-spec.ts`
5. `documentacion/api/admin/008-get-admin-orders-id.md` + README
6. `npm run build` + `npm run lint` + `npm run test` + `npm run test:e2e`
