# Propuesta: Módulo admin — cola del local, transiciones de estado, confirmación de cobro y pedidos presenciales

Cierra el ciclo del negocio: hoy un pedido `cash` queda `pending`
eterno — nadie lo confirma, nadie lo avanza, nadie cobra. Esta
propuesta agrega los endpoints del dueño (`role: admin`, el JWT ya
trae el claim y `RolesGuard`/`@Roles` ya existen) más el pedido
presencial `dine_in`/`pickup` con mesa — todo lo que el modelo de
datos ya declaró (`customer_id` NULL + `taken_by` + `table_id`,
índice parcial "mesa ocupada", `payments.confirmed_by/at`).

**Alcance**: 5 endpoints bajo `/admin/*` + seed del usuario admin +
extracción del builder de ítems compartido. Fuera: UI admin en la app
(ciclos posteriores), CRUD de mesas (seed ya las crea), reembolsos
(registrado como pendiente), edición de catálogo/horarios.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/orders/presentation/controllers/admin-orders.controller.ts` | nuevo — `GET /admin/orders`, `PATCH /admin/orders/:id/status`, `POST /admin/orders/:id/confirm-payment`, `POST /admin/orders`, `GET /admin/tables` |
| `src/modules/orders/application/services/orders.service.ts` | +4 métodos delegando a los nuevos use-cases |
| `src/modules/orders/application/dtos/list-admin-orders.query.dto.ts` | nuevo — `bucket`/`page`/`limit` |
| `src/modules/orders/application/dtos/update-order-status.dto.ts` | nuevo — `to` + `cancelReason?` |
| `src/modules/orders/application/dtos/create-in-person-order.dto.ts` | nuevo — pedido presencial |
| `src/modules/orders/application/dtos/admin-order-response.dto.ts` | nuevo — OrderResponse + tableLabel/customerName/channel |
| `src/modules/orders/application/dtos/admin-tables.response.dto.ts` | nuevo — mesas con ocupación |
| `src/modules/orders/application/mappers/order.mapper.ts` | +`toAdminResponse` |
| `src/modules/orders/application/mappers/admin-tables.mapper.ts` | nuevo |
| `src/modules/orders/application/use-cases/list-admin-orders.use-case.ts` | nuevo |
| `src/modules/orders/application/use-cases/update-order-status.use-case.ts` | nuevo |
| `src/modules/orders/application/use-cases/confirm-order-payment.use-case.ts` | nuevo |
| `src/modules/orders/application/use-cases/create-in-person-order.use-case.ts` | nuevo |
| `src/modules/orders/application/use-cases/list-admin-tables.use-case.ts` | nuevo |
| `src/modules/orders/domain/services/order-items-builder.service.ts` | nuevo — ítems+precios de BD compartido |
| `src/modules/orders/application/use-cases/create-order.use-case.ts` | refactor — delega ítems al builder |
| `src/modules/orders/domain/exceptions/invalid-status-transition.exception.ts` | nuevo — 409 |
| `src/modules/orders/domain/exceptions/payment-not-settled.exception.ts` | nuevo — 409 |
| `src/modules/orders/domain/exceptions/payment-not-confirmable.exception.ts` | nuevo — 409 |
| `src/modules/orders/domain/exceptions/table-not-found.exception.ts` | nuevo — 404 |
| `src/modules/orders/domain/repositories/order.repository.interface.ts` | +`findForAdmin`, `findById`, `transitionStatus`, `confirmPayment`, `findActiveTableIds` |
| `src/modules/orders/infrastructure/repositories/order.repository.ts` | implementa los 5 |
| `src/modules/store/domain/repositories/store.repository.interface.ts` | +`getTables()` |
| `src/modules/store/infrastructure/repositories/store.repository.ts` | implementa `getTables` |
| `src/modules/auth/domain/repositories/user.repository.interface.ts` | +`findNamesByIds` (nombre del cliente en la cola) |
| `src/modules/auth/infrastructure/repositories/user.repository.ts` | implementa |
| `src/modules/orders/orders.module.ts` | registra los 5 use-cases + builder + controller |
| `src/infrastructure/database/seeds/admin.seed.ts` | nuevo — usuario admin desde env |
| `package.json` | script `seed:admin` |
| `.env.example` | `ADMIN_EMAIL`/`ADMIN_PASSWORD` (dev) |
| `documentacion/api/admin/*` + `README.md` | 5 docs nuevos + índice |
| `documentacion/modelo-de-datos.md` | flujo sin `preparing` (miembro reservado del enum) |
| specs + `test/admin/admin.e2e-spec.ts` | nuevos |

---

## 1. `admin-orders.controller.ts` (archivo nuevo — stub: clase + constructor)

**Ruta:** `src/modules/orders/presentation/controllers/admin-orders.controller.ts`

```typescript
import { Controller, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { OrdersService } from '../../application/services/orders.service';

// Panel del dueño — TODO cuelga de @Roles('admin'): el JWT ya trae
// role (session.service) y JwtAuthGuard global corre antes. RolesGuard
// no es APP_GUARD — se aplica explícito acá para no afectar los
// endpoints de cliente.
@Controller('admin')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}
}
```

## 2. `orders.service.ts` (archivo existente — stubs de delegación)

**Ruta:** `src/modules/orders/application/services/orders.service.ts`

En el constructor se inyectan los 5 use-cases nuevos y se agregan los
métodos delegadores (`listAdmin`, `updateStatus`, `confirmPayment`,
`createInPerson`, `listTables`) — primero como stubs que devuelven el
tipo del mapper para que el controller compile; se completan en sus
pasos.

## 3. `list-admin-orders.query.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/application/dtos/list-admin-orders.query.dto.ts`

Misma forma que `ListOrdersQueryDto` (`bucket: 'active'|'history'`
default `active`, `page` default 1 `Min(1)`, `limit` default 20
`Min(1)/Max(50)`, `IsOptional` en los tres).

## 4. `update-order-status.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/application/dtos/update-order-status.dto.ts`

```typescript
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { OrderStatus } from '../../domain/enums/order-status.enum';

// DECISIÓN USUARIO: 'preparing' NO va — el dueño hace todo (cocina +
// entrega), el intermedio no le dice nada. El flujo real es
// pending → confirmed → done. El miembro del enum se queda (la app ya
// lo mapea y la migración no se toca) pero ninguna transición lo
// produce — queda inalcanzable por contrato.
export class UpdateOrderStatusDto {
  @IsIn(['confirmed', 'done', 'cancelled'])
  to!: 'confirmed' | 'done' | 'cancelled';

  /** Solo con to='cancelled' — razón user-facing en español. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cancelReason?: string;
}
```

## 5. `create-in-person-order.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/application/dtos/create-in-person-order.dto.ts`

```typescript
import {
  ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID,
  Matches, MaxLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderItemDto } from './create-order.dto';

// Pedido que toma el dueño en el local — sin cliente ni dirección.
// dine_in exige tableId; pickup presencial lo prohíbe (la persona se
// lleva el pedido). La validación cruzada de campos va en el
// use-case (mismo patrón que POST /orders).
export class CreateInPersonOrderDto {
  @IsIn(['dine_in', 'pickup'])
  serviceType!: 'dine_in' | 'pickup';

  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsIn(['cash', 'transfer'])
  paymentMethod!: 'cash' | 'transfer';

  @IsOptional()
  @Matches(/^3\d{9}$/)
  payerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
```

`OrderItemDto` se exporta desde `create-order.dto.ts` (ya está
declarado ahí — se le agrega `export` si no lo tiene).

## 6. `admin-order-response.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/application/dtos/admin-order-response.dto.ts`

```typescript
import { OrderResponseDto } from './order-response.dto';

// Vista del dueño: lo que ve el cliente + datos operativos que la
// respuesta pública oculta a propósito (canal, mesa, quién pidió).
export class AdminOrderResponseDto extends OrderResponseDto {
  channel!: string;
  tableLabel!: string | null;
  customerName!: string | null;
}

export class AdminOrderListResponseDto {
  items!: AdminOrderResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
```

## 7. `admin-tables.response.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/application/dtos/admin-tables.response.dto.ts`

```typescript
export class AdminTableItemDto {
  id!: string;
  label!: string;
  isActive!: boolean;
  /** Número del pedido dine_in vivo en la mesa — null = libre. */
  activeOrderNumber!: number | null;
}

export class AdminTablesResponseDto {
  items!: AdminTableItemDto[];
}
```

## 8. `order.mapper.ts` (archivo existente — agregar método)

**Ruta:** `src/modules/orders/application/mappers/order.mapper.ts`

```typescript
// El admin ve el pedido completo + contexto operativo — se pasa por
// parámetro porque el mapper no consulta (responsabilidad del
// use-case llenar tableLabel/customerName).
toAdminResponse(
  order: Order,
  extra: { tableLabel: string | null; customerName: string | null },
): AdminOrderResponseDto {
  const dto = new AdminOrderResponseDto();
  Object.assign(dto, this.toResponse(order));
  dto.channel = order.channel;
  dto.tableLabel = extra.tableLabel;
  dto.customerName = extra.customerName;
  return dto;
}
```

## 9. `admin-tables.mapper.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/application/mappers/admin-tables.mapper.ts`

`toTablesResponse(tables: StoreTable[], activeByTable: Map<string, number>)`
→ `AdminTablesResponseDto` (`activeOrderNumber = activeByTable.get(t.id) ?? null`).

## 10. `order-items-builder.service.ts` (archivo nuevo — extracción)

**Ruta:** `src/modules/orders/domain/services/order-items-builder.service.ts`

Mueve `buildValidatedItems` + `assertPayloadCombinations`-adyacentes de
`CreateOrderUseCase` (la revalidación de catálogo: producto existe y
está disponible, opciones, `added`/`removed`, reemplazo gratis con sus
flags, `includedNames`, snapshots, `lineTotal`) a un servicio de
dominio `@Injectable()` inyectable con `ICatalogRepository`. Firma:

```typescript
build(
  items: { productId: string; quantity: number; notes?: string;
           modifiers: { optionId: string; action: 'added' | 'removed';
                        replacesOptionId?: string }[] }[],
): Promise<OrderItem[]>
```

`CreateOrderUseCase` pasa a inyectar `OrderItemsBuilder` y su paso de
ítems queda `const items = await this.itemsBuilder.build(cmd.items)`.
La lógica no cambia — solo se mueve (el spec de create-order sigue
cubriéndola; el builder gana spec propio solo si el refactor separa
casos nuevos).

## 11. `list-admin-orders.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/application/use-cases/list-admin-orders.use-case.ts`

```typescript
export interface ListAdminOrdersQuery {
  bucket: 'active' | 'history';
  page: number;
  limit: number;
}

// Cola del local: active = pending/confirmed/preparing de CUALQUIER
// fecha (un pending de ayer no se puede perder — el dueño lo resuelve);
// history = done/cancelled paginado. Sin filtro de cliente: el dueño
// ve todo (las presenciales tienen customer_id NULL y aparecen igual).
@Injectable()
export class ListAdminOrdersUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: IOrderRepository,
    @Inject(STORE_REPOSITORY) private readonly store: IStoreRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly mapper: OrderMapper,
  ) {}

  async execute(q: ListAdminOrdersQuery): Promise<AdminOrderListResponseDto> {
    const page = await this.orders.findForAdmin(q.bucket, q.page, q.limit);
    // Enriquecimiento batcheado (anti N+1): labels de mesas usadas +
    // nombres de clientes de las filas de la página.
    const tableIds = [...new Set(page.items.map((o) => o.tableId)
      .filter((t): t is string => !!t))];
    const customerIds = [...new Set(page.items.map((o) => o.customerId)
      .filter((c): c is string => !!c))];
    const [tables, names] = await Promise.all([
      this.store.getTablesByIds(tableIds),
      this.users.findNamesByIds(customerIds),
    ]);
    const labelByTable = new Map(tables.map((t) => [t.id, t.label]));
    return {
      items: page.items.map((o) => this.mapper.toAdminResponse(o, {
        tableLabel: o.tableId ? (labelByTable.get(o.tableId) ?? null) : null,
        customerName: o.customerId ? (names.get(o.customerId) ?? null) : null,
      })),
      total: page.total,
      page: q.page,
      limit: q.limit,
    };
  }
}
```

## 12. `update-order-status.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/application/use-cases/update-order-status.use-case.ts`

```typescript
// Matriz del flujo corto SIN 'preparing' (decisión usuario §019):
// pending→confirmed→done + cancelled en cualquier punto no terminal.
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['done', 'cancelled'],
  preparing: ['done', 'cancelled'], // inalcanzable por contrato
  done: [],
  cancelled: [],
};

@Injectable()
export class UpdateOrderStatusUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: IOrderRepository,
    @Inject(STORE_REPOSITORY) private readonly store: IStoreRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly mapper: OrderMapper,
  ) {}

  async execute(cmd: { orderId: string; to: OrderStatus;
                       cancelReason?: string }): Promise<AdminOrderResponseDto> {
    const order = await this.orders.findById(cmd.orderId);
    if (!order) throw new OrderNotFoundException();
    // Invariante del negocio: no se entrega sin cobrar — done exige
    // el payment ya resuelto (cash se marca con confirm-payment;
    // transfer espera su webhook).
    if (
      cmd.to === OrderStatus.DONE &&
      order.payment?.status !== PaymentStatus.PAID
    ) {
      throw new PaymentNotSettledException();
    }
    // Cancel con pago pendiente: el pago muere con la orden (claim
    // condicional igual que el cancel del cliente). Un 'paid' NO se
    // toca — el reembolso se resuelve manual (pendiente).
    if (cmd.to === OrderStatus.CANCELLED) {
      order.cancelReason = cmd.cancelReason?.trim() || null;
      if (order.payment?.status === PaymentStatus.PENDING) {
        order.payment.status = PaymentStatus.FAILED;
      }
    }
    // UPDATE condicional: affected=0 → el estado cambió entre la
    // lectura y el write (webhook o doble tap del dueño) → 409, no
    // un write ciego.
    const moved = await this.orders.transitionStatus(order, cmd.to);
    if (!moved) throw new InvalidStatusTransitionException();
    // Respuesta admin completa (misma hidratación que el listado).
    return this.mapper.toAdminResponse(order, {
      tableLabel: /* lookup si tiene tableId */ null,
      customerName: /* lookup si tiene customerId */ null,
    });
  }
}
```

La matriz se evalúa ANTES del write: `to` fuera de `ALLOWED[from]` →
`InvalidStatusTransitionException` sin tocar nada. El UPDATE
condicional del repo usa `WHERE id AND status IN (fromsQueLleganA.to)`
— o más simple y suficiente: `WHERE id AND status = <fromLeido>` con
la transición ya validada en memoria.

## 13. `confirm-order-payment.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/application/use-cases/confirm-order-payment.use-case.ts`

```typescript
// El dueño marca "me pagó" — cash en la entrega/mesa, transfer manual
// futuro. Claim atómico: UPDATE payments SET paid+confirmed_by+now
// WHERE status='pending'; affected=0 → ya resuelto (idempotente si
// era paid; 409 si era failed/refunded).
@Injectable()
export class ConfirmOrderPaymentUseCase {
  // execute({orderId, adminId}): Promise<AdminOrderResponseDto>
  // findById → 404 · sin payment → PaymentNotConfirmableException
  // payment.status:
  //   paid      → responde la orden tal cual (idempotente)
  //   failed/refunded → PaymentNotConfirmableException (409)
  //   pending   → repo.confirmPayment(orderId, adminId) → false → 409
}
```

## 14. `create-in-person-order.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/application/use-cases/create-in-person-order.use-case.ts`

```typescript
// El dueño toma el pedido en el local — nace CONFIRMED (no hay
// "esperando confirmación del local": el local lo creó). No evalúa
// isOpenNow ni mínimo de delivery (reglas del canal online).
@Injectable()
export class CreateInPersonOrderUseCase {
  // Validaciones de combinación (mismos honestos-400):
  //   dine_in exige tableId · pickup prohíbe tableId
  //   transfer exige payerPhone · cash prohíbe payerPhone
  //   tableId existe y está activa → TableNotFoundException (404)
  // Ítems: this.itemsBuilder.build(cmd.items) — mismos 400 de catálogo.
  // Pago: cash → payment pending; transfer → gateway.initiatePush
  //   igual que online (PaymentDispatchFailedException → 502).
  // Agregado: channel=presencial, customerId=null, takenBy=adminId,
  //   tableId, serviceType, orderNumber del consecutivo diario
  //   compartido (createAggregate ya lo da), deliveryFee=0.
}
```

## 15. `list-admin-tables.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/application/use-cases/list-admin-tables.use-case.ts`

`store.getTables()` + `orders.findActiveTableIds()` → mapper con
`activeOrderNumber` por mesa.

## 16. Excepciones nuevas (4 archivos, `domain/exceptions/`)

```typescript
// invalid-status-transition.exception.ts
super('Order cannot move to that status', 409, 'INVALID_STATUS_TRANSITION');
// payment-not-settled.exception.ts
super('Order payment is not settled', 409, 'PAYMENT_NOT_SETTLED');
// payment-not-confirmable.exception.ts
super('Payment cannot be confirmed', 409, 'PAYMENT_NOT_CONFIRMABLE');
// table-not-found.exception.ts
super('Table not found', 404, 'TABLE_NOT_FOUND');
```

## 17. `order.repository.interface.ts` (archivo existente — agregar)

```typescript
/** Cola del dueño — sin filtro de cliente (presenciales con NULL). */
findForAdmin(bucket: 'active' | 'history', page: number,
             limit: number): Promise<OrderListPage>;
/** Vista del dueño — id solo, sin filtro de customer. */
findById(id: string): Promise<Order | null>;
/**
 * Transición admin atómica: UPDATE orders SET status/cancelReason
 * WHERE id AND status=<estado leído>. false → alguien movió la orden
 * entre read y write → 409 (patrón consumo atómico).
 */
transitionStatus(order: Order, to: OrderStatus): Promise<boolean>;
/**
 * Claim del cobro manual: UPDATE payments SET paid, confirmed_by,
 * confirmed_at WHERE id AND status='pending'. false → ya resuelto.
 */
confirmPayment(orderId: string, adminId: string): Promise<boolean>;
/** Mesas con pedido dine_in vivo → tableId → orderNumber. */
findActiveTableIds(): Promise<Map<string, number>>;
```

`transitionStatus` también marca `payment.status='failed'` dentro de
la misma tx cuando el agregado trae payment mutado a failed (el cancel
del dueño mata el pago pendiente con el mismo claim condicional que
`cancelPendingAggregate` — o se compone: en tx, si `to==='cancelled'`
primero `em.update(Payment, {id, status: PENDING}, {status: FAILED})`
y luego el UPDATE de orders).

## 18. `order.repository.ts` (archivo existente — implementar los 5)

- `findForAdmin`: misma estructura de `findByCustomer` sin
  `customerId` (active sin paginar, history `findAndCount`), con
  `attachItemsAndPayments`. Orden de la cola: `pending` primero, luego
  `confirmed`, luego `preparing`, `createdAt ASC` dentro de cada uno
  (la cocina atiende en orden de llegada — CASE en `order` o orden
  compuesto `status` no es alfabético; se resuelve con
  `addOrderBy("CASE o.status WHEN 'pending' THEN 0 WHEN 'confirmed'
  THEN 1 ELSE 2 END")` + `created_at ASC`, o batch en memoria si el
  query builder complica — lo más simple es `order: {createdAt: 'ASC'}`
  puro y el front/la cola agrupa por status, decidir en implementación).
- `findById`: `orm.findOne({where:{id}})` + `attachItemsAndPayments`
  con modifiers (el dueño ve la personalización completa).
- `transitionStatus` / `confirmPayment`: UPDATE condicionales en tx.
- `findActiveTableIds`: `SELECT table_id, MIN(order_number) FROM
  orders WHERE service_type='dine_in' AND status IN
  ('pending','confirmed','preparing') AND table_id IS NOT NULL GROUP
  BY table_id` → Map.

## 19. `store.repository.interface.ts` + `store.repository.ts`

```typescript
getTables(): Promise<StoreTable[]>;
getTablesByIds(ids: string[]): Promise<StoreTable[]>; // [] → []
```

## 20. `user.repository.interface.ts` + `user.repository.ts`

```typescript
/** id → name, para enriquecer la cola admin (una sola query IN). */
findNamesByIds(ids: string[]): Promise<Map<string, string>>;
```

## 21. `orders.module.ts` (archivo existente)

Registra `AdminOrdersController` en `controllers`, los 5 use-cases +
`OrderItemsBuilder` en providers. `IUserRepository`/`IStoreRepository`
ya son importables (orders ya usa `STORE_REPOSITORY`; el
`USER_REPOSITORY` — verificar que `AuthModule` lo exporta; si no,
exportarlo).

## 22. `admin.seed.ts` (archivo nuevo)

**Ruta:** `src/infrastructure/database/seeds/admin.seed.ts`

Script como `store.seed.ts`: lee `ADMIN_EMAIL`/`ADMIN_PASSWORD` de
`.env`, upsert por email — `role='admin'`, `status='active'`,
`email_verified_at=now()`, `password_hash` via bcrypt directo (el
script corre fuera de Nest, igual que el store seed). Si el usuario
existe actualiza role/status pero NO el password (no pisa un cambio
manual). `package.json` + `"seed:admin": "ts-node -r tsconfig-paths/register src/infrastructure/database/seeds/admin.seed.ts"`.
`.env.example` documenta las dos vars (dev-only — en producción el
admin se crea una vez a mano o via migración controlada, pendiente
de deploy).

## 23. `admin-orders.controller.ts` (completar — métodos)

```typescript
@Get('orders')
listAdmin(
  @Query() q: ListAdminOrdersQueryDto,
): Promise<AdminOrderListResponseDto> {
  return this.ordersService.listAdmin(q);
}

@Patch('orders/:id')
updateStatus(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: UpdateOrderStatusDto,
  @CurrentUser() user: JwtUser,
): Promise<AdminOrderResponseDto> {
  return this.ordersService.updateStatus(id, dto);
}

@Post('orders/:id/confirm-payment')
@HttpCode(200)
confirmPayment(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() user: JwtUser,
): Promise<AdminOrderResponseDto> {
  return this.ordersService.confirmPayment(id, user.userId);
}

@Post('orders')
createInPerson(
  @Body() dto: CreateInPersonOrderDto,
  @CurrentUser() user: JwtUser,
): Promise<AdminOrderResponseDto> {
  return this.ordersService.createInPerson(user.userId, dto);
}

@Get('tables')
listTables(): Promise<AdminTablesResponseDto> {
  return this.ordersService.listTables();
}
```

## 24. Tests

- **Use-case specs**: list-admin (enriquecimiento, presencial sin
  customer), update-status (matriz completa: cada transición válida +
  cada inválida, done-sin-paid → 409, cancel pone failed al payment
  pendiente, conditional-update false → 409), confirm-payment
  (pending→paid idempotente, failed → 409), create-in-person
  (dine_in+mesa, pickup presencial, combinaciones 400, mesa
  inexistente 404, transfer dispara gateway, cash no), list-tables
  (ocupada/libre).
- **Repo spec**: `findForAdmin`, `transitionStatus` (condicional),
  `confirmPayment` (claim), `findActiveTableIds`.
- **e2e** `test/admin/admin.e2e-spec.ts`: rol customer → 403 en todos;
  admin sembrado → cola, pending→confirmed→done con confirm-payment
  cash en medio, done-sin-paid → 409, presencial dine_in con mesa,
  `to: 'preparing'` → 400 (fuera del contrato), transición inválida
  (pending→done de un salto) → 409.

## 25. `documentacion/api/admin/` (5 docs) + README índice

`001-get-admin-orders.md`, `002-patch-admin-orders-id-status.md`,
`003-post-admin-orders-id-confirm-payment.md`,
`004-post-admin-orders.md`, `005-get-admin-tables.md` — request,
respuestas con JSON real, matriz de transiciones y errores por código.
El índice README suma las 5 filas.

## Decisiones tomadas (encuesta 2026-…)

1. **Un solo `PATCH /status` con matriz** — y el usuario recortó el
   flujo: **`preparing` no va** (el dueño cocina y entrega solo). El
   enum conserva el miembro (app ya lo mapea, migración intacta) pero
   ningún `to` ni transición lo produce — si algún día el local crece
   y quiere "en cocina", se habilita sin migración. El
   `modelo-de-datos.md` se actualiza (flujo documentado pasa a
   `pending→confirmed→done`; `preparing` queda como miembro
   reservado).
2. **`done` exige `payment.status='paid'`** — confirmado: "no se
   entrega sin cobrar" es invariante; cash se marca con
   `confirm-payment` antes de cerrar (`409 PAYMENT_NOT_SETTLED` si se
   intenta antes).
3. **Presencial nace `confirmed`** — el local lo crea ya aceptado.
4. **Backend solo** — UI admin en la app va en ciclos posteriores;
   siguiente trabajo de app: tab **Perfil** del cliente (hoy
   `ModulePlaceholderScreen`).
5. **Mesas read-only** (las 4 del seed) — sin CRUD de mesas aún.
6. **Cancel admin permitido desde pending/confirmed**; si el pago
   estaba `paid` queda `paid` (reembolso manual — pendiente).
7. **Sin reembolso** en esta propuesta — `refunded` se implementa con
   el flujo de devoluciones.
8. **Admin seed por env** — `ADMIN_EMAIL`/`ADMIN_PASSWORD` en dev.

## Orden de aplicación recomendado

1. `admin-orders.controller.ts` (stub)
2. `orders.service.ts` (inyectar + stubs)
3. DTOs (4 archivos) + `export` de `OrderItemDto` en create-order.dto
4. Excepciones (4 archivos)
5. `order.repository.interface.ts` + `store.repository.interface.ts`
   + `user.repository.interface.ts`
6. Implementaciones de los 3 repos
7. `order-items-builder.service.ts` + refactor de `create-order`
8. Use-cases (5)
9. Mapper + admin-tables.mapper + DTOs response
10. `orders.service.ts` (delegación completa)
11. Controller (métodos)
12. `orders.module.ts` (+ export de USER_REPOSITORY si falta en auth)
13. `admin.seed.ts` + `package.json` + `.env.example`
14. `modelo-de-datos.md`: línea de `status` pasa a
    `pending` → `confirmed` → `done` y la nota de "Flujo corto" se
    reescribe igual — con aclaración: "`preparing` existe en el enum
    como reserva (cocina dedicada futura) pero ninguna transición lo
    produce; la app ya tolera su aparición".
15. specs + e2e
16. `documentacion/api/admin/` + README

## Auditoría (revisor) — APROBADO CON OBSERVACIONES

Ronda 1 del revisor sobre el diff completo. Sin CRÍTICOS; un
IMPORTANTE estructural y varios MENORES/INFO — todos aplicados:

- **IMPORTANTE — commits parciales en transacciones de agregado**:
  `cancelPendingAggregate`, `resolvePaymentAggregate` y
  `transitionStatus` hacían `return false/null` tras un `affected=0`
  en el UPDATE de la orden — pero `transaction()` commitea el write
  previo del payment → quedaba `confirmed`+`failed` (callejón sin
  salida). Fix: centinela `AggregateLostError` lanzada dentro de la
  tx → rollback de AMBOS writes → el caller recibe `false`/`null` y
  re-lee para responder idempotente. 2 specs nuevos cubren el
  rollback. El Symbol centinela se reemplazó por clase Error (eslint
  `only-throw-error`).
- **M — `findNamesByIds` sin specs**: agregados (IN+select parcial,
  vacío→Map vacío sin query, soft-delete implícito por `deletedAt`
  IsNull en el where).
- **M — reembolsos sin pendiente**: `pendientes/011-reembolsos.md`
  creado (endpoint refund, cola "pagos por reembolsar", reverso Nequi).
- **M — `@Injectable` en `OrderItemsBuilder` (domain)**: excepción
  deliberada documentada en el propio archivo — es un servicio de
  dominio que solo orquesta el PUERTO de catálogo; el impl concreto
  sigue en infrastructure.
- **M — use-cases admin construían DTOs** (violación de
  `strict-layering-rule`, ofrecía "documentar o refactorizar"): se
  refactorizó — regla dura del proyecto, no documentable. Los 5
  use-cases devuelven estructuras internas (`admin-order-results.ts`:
  `AdminOrderResult`/`AdminOrderListResult`/`AdminTablesResult`) y
  `OrdersService` invoca `OrderMapper.toAdminResponse`/
  `toAdminListResponse`/`AdminTablesMapper` — misma orquestación que
  el lado cliente. Specs ajustados + 2 tests nuevos del mapper.
- INFO anotados (no bloquean): el UPDATE no-op del payment ya failed
  es claim defensivo; `confirmPayment` 409 en carrera perdida es la
  semántica acordada; `businessDate` duplicado (extraíble después);
  presencial sin idempotency-key documentado; confirm-payment no
  rechaza `cancelled` explícitamente (estado inalcanzable por los
  flujos actuales — el claim condicional lo cubre).

Post-correcciones: `npm run build` limpio · `npm run test` **303/303**
· `npm run test:e2e` **108/108** · eslint limpio en lo tocado.
