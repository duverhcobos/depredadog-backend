# Propuesta: pedidos del cliente (`POST/GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`)

El checkout y el tab de Pedidos de la app son hoy mocks (§022-024).
Esta propuesta crea el módulo `orders` (hoy solo tiene dominio:
entidades y enums del 013) con los 4 endpoints del cliente —
**crear pedido con revalidación de catálogo server-side**, mis
pedidos, detalle del mío y cancelación en `pending`.

Las tablas `orders`/`order_items`/`order_item_modifiers`/`payments`
ya existen (013); falta la migración §024: `orders.contact_phone`,
`orders.delivery_location_link` (pin de Google por pedido) y
`payments.payer_phone`.

**Reglas de negocio ya decididas (del usuario):**

- **Local = solo transferencia** — un pedido pickup pagado al
  recibir quedaría hecho y abandonado sin pago. `cash` solo existe
  en `delivery` (§022c).
- **`contact_phone` requerido en delivery** — quién recibe (§024);
  `payer_phone` requerido cuando `transfer` — quién paga (§024).
- Cancelar solo en `pending` (§023 — "Recibido").
- El pedido referencia dirección **guardada** (`address_id` +
  snapshot) o **nueva no guardada** (solo snapshot — §022a la zona
  no tiene nomenclatura: el landmark ES la dirección).
- El precio se **revalida contra el catálogo** — el cliente manda
  ids+acciones, NUNCA precios (el carrito ya advierte: "la orden se
  revalida en el backend").

**Decisiones embebidas — encuestadas y aprobadas (todas):**

- **"Guardar esta ubicación" = dos llamadas**: la app hace
  `POST /addresses` cuando el checkbox va marcado y luego manda el
  `addressId` resultante. El contrato de `/orders` queda limpio
  (`addressId` XOR `newAddress`) sin escritura cross-módulo; si la
  orden falla después, la dirección guardada queda — es benigna, el
  cliente la pidió guardar.
- **`orders.delivery_location_link` columna nueva** — el pin viaja
  por pedido (sirve con dirección guardada o nueva); NO se pliega
  dentro del texto de `delivery_address` (el snapshot queda
  legible/comanda-friendly).
- **Cancelar con pago `pending` → `payments.status = 'failed'`** en
  la misma transacción — no queda pago huérfano esperando push.
- **`client_request_id` uuid opcional** con índice único
  `(customer_id, client_request_id)` — el doble-tap/reintento de
  red responde con la misma orden (idempotencia barata); sin él un
  retry crea dos pedidos.
- **El local cerrado rechaza**: `StoreSchedule.isOpenNow` en el
  use-case → 409 (la app ya deshabilita el CTA, pero el contrato se
  defiende solo).
- **`min_delivery_order` se exige** si `store_settings` lo tiene —
  subtotal < mínimo → 409.
- **GET /orders con `bucket=active|history`**: active sin paginación
  (acotado por naturaleza), history paginado `page/limit` con
  envelope `{items,total,page,limit}` (listados-paginacion-indices).

**Módulo:** `orders` nuevo. El `payment` inicial se escribe dentro de
la transacción del agregado Order (4 tablas) — `payments` tendrá su
propio módulo/endpoints en la propuesta del adapter (Nequi, pendiente
010); acá solo nace la fila.

**Endpoints:**

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/orders` | Crear (channel=`online`) — revalida catálogo, snapshot, payment row (201) |
| `GET` | `/orders?bucket=active\|history&page&limit` | Mis pedidos — active sin paginar; history con envelope |
| `GET` | `/orders/:id` | Detalle del mío (404 ajeno/inexistente) |
| `POST` | `/orders/:id/cancel` | Cancelar en `pending` (body `{reason?}`) |

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/infrastructure/database/migrations/<ts>-AddOrderPhonesAndLocationLink.ts` | **nuevo** — 3 columnas §024 + índice idempotencia |
| `src/modules/orders/domain/entities/order.entity.ts` | update — `contactPhone`, `deliveryLocationLink`, `clientRequestId` |
| `src/modules/orders/domain/entities/order.entity.ts` + `payment.entity.ts` | update — `Payment.payerPhone` |
| `src/modules/orders/domain/exceptions/*.ts` | **nuevos** ×5 |
| `src/modules/orders/domain/repositories/order.repository.interface.ts` | **nuevo** |
| `src/modules/orders/application/dtos/*.ts` | **nuevos** — create/cancel/query/response |
| `src/modules/orders/application/use-cases/*.ts` | **nuevos** ×4 |
| `src/modules/orders/application/services/orders.service.ts` | **nuevo** |
| `src/modules/orders/application/mappers/order.mapper.ts` | **nuevo** |
| `src/modules/orders/infrastructure/repositories/order.repository.ts` | **nuevo** — tx de 4 tablas + consecutivo |
| `src/modules/orders/presentation/controllers/orders.controller.ts` | **nuevo** |
| `src/modules/orders/orders.module.ts` | **nuevo** |
| `src/infrastructure/database/schemas/order.schema.ts` + `payment.schema.ts` | update — columnas nuevas |
| `src/modules/catalog/domain/repositories/catalog.repository.interface.ts` | + `getOrderableProducts(ids)` |
| `src/modules/catalog/infrastructure/repositories/catalog.repository.ts` | impl del finder |
| `src/modules/catalog/catalog.module.ts` | `exports: [CATALOG_REPOSITORY]` |
| `src/modules/store/store.module.ts` | `exports: [STORE_REPOSITORY]` |
| `src/modules/auth/auth.module.ts` | `exports: [ADDRESS_REPOSITORY]` |
| `src/app.module.ts` | + `OrdersModule` |
| `test/orders/orders.e2e-spec.ts` + specs unitarios | **nuevos** |
| `test/support/e2e-app.ts` | truncate + `orders,payments` |
| `documentacion/api/orders/00X-*.md` + README + `modelo-de-datos.md` | docs |

---

## 1. Migración

**Ruta:** `src/infrastructure/database/migrations/<ts>-AddOrderPhonesAndLocationLink.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderPhonesAndLocationLink implements MigrationInterface {
  name = 'AddOrderPhonesAndLocationLink';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // §024 — quién recibe (delivery lo exige en app).
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "contact_phone" varchar(20)`,
    );
    // Pin de Google adjunto al pedido (§022d) — sirve con dirección
    // guardada o nueva; NO se pliega en delivery_address.
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "delivery_location_link" text`,
    );
    // §024 — quién paga: el celular que recibe el push (transfer).
    await queryRunner.query(
      `ALTER TABLE "payments" ADD COLUMN "payer_phone" varchar(20)`,
    );
    // Idempotencia del POST — doble-tap/reintento responde la misma
    // orden en vez de duplicarla. NULL en presencial/manual.
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "client_request_id" uuid`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_orders_client_request"
      ON "orders" ("customer_id", "client_request_id")
      WHERE "client_request_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_orders_client_request"`);
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "client_request_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP COLUMN "payer_phone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "delivery_location_link"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "contact_phone"`,
    );
  }
}
```

## 2. Dominio

**`order.entity.ts`** — agregar al final de los campos:

```typescript
  /** Quién recibe — la app lo exige en delivery (§024). */
  contactPhone: string | null = null;
  /** Pin de Google adjunto al pedido (§022d). */
  deliveryLocationLink: string | null = null;
  /** Idempotencia del POST del cliente — UNIQUE con customer_id. */
  clientRequestId: string | null = null;
  /** Cargado por el repositorio cuando el use-case lo pide. */
  payment: Payment | null = null;
```

(e import `Payment` de payments/domain — referencia de entidades entre
módulos es aceptable: orders es el agregado dueño de la fila inicial.)

**`payment.entity.ts`** — agregar:

```typescript
  /** Celular que recibe el push (transfer — quién paga, §024). */
  payerPhone: string | null = null;
```

**Excepciones nuevas** (`src/modules/orders/domain/exceptions/`):

```typescript
// order-not-found.exception.ts — 404 (ajena = inexistente, IDOR)
export class OrderNotFoundException extends DomainException {
  constructor() {
    super('Order not found', 404);
  }
}

// order-not-cancellable.exception.ts — 409
export class OrderNotCancellableException extends DomainException {
  constructor() {
    super('Order can only be cancelled while pending', 409);
  }
}

// store-closed.exception.ts — 409
export class StoreClosedException extends DomainException {
  constructor() {
    super('Store is closed', 409);
  }
}

// min-order-amount.exception.ts — 409
export class MinOrderAmountException extends DomainException {
  constructor(min: number) {
    super(`Delivery orders require a minimum of ${min}`, 409);
  }
}

// order-catalog-violation.exception.ts — 409: la revalidación
// detectó producto/modificador inválido o agotado. El mensaje dice
// QUÉ falló (la app lo muestra y refresca la carta).
export class OrderCatalogViolationException extends DomainException {
  constructor(detail: string) {
    super(`Order rejected by catalog: ${detail}`, 409);
  }
}

// invalid-order-data.exception.ts — 400: combinación inválida
// (pickup+cash, transfer sin payerPhone, delivery sin dirección…)
export class InvalidOrderDataException extends DomainException {
  constructor(detail: string) {
    super(detail, 400);
  }
}
```

**`order.repository.interface.ts`** (nuevo):

```typescript
import { Order } from '../entities/order.entity';

export interface OrderListPage {
  items: Order[];
  total: number;
}

export interface IOrderRepository {
  /**
   * Busca una orden del cliente por su client_request_id — la
   * idempotencia del POST la resuelve el use-case ANTES de crear.
   */
  findByClientRequest(
    customerId: string,
    clientRequestId: string,
  ): Promise<Order | null>;
  /**
   * Persiste el agregado completo (orders + items + modifiers +
   * payment inicial) en UNA transacción. El consecutivo diario se
   * calcula adentro: SELECT MAX(order_number)+1 WHERE order_date
   * — la UNIQUE(order_date, order_number) es la verdad; una
   * colisión reintenta hasta 3 veces.
   */
  createAggregate(order: Order): Promise<Order>;
  /**
   * Mis pedidos. bucket 'active' = pending|confirmed|preparing sin
   * paginar (acotado por naturaleza); 'history' = done|cancelled
   * paginado. Incluye items (sin modifiers) + payment en ambos —
   * la card muestra ítems y el chip de pago.
   */
  findByCustomer(
    customerId: string,
    bucket: 'active' | 'history',
    page: number,
    limit: number,
  ): Promise<OrderListPage>;
  /** IDOR-safe: null si no existe O si no es del cliente. */
  findByIdForCustomer(id: string, customerId: string): Promise<Order | null>;
  /** Persiste el cambio de estado + payment del cancel en una tx. */
  saveAggregate(order: Order): Promise<Order>;
}

export const ORDER_REPOSITORY = Symbol('IOrderRepository');
```

## 3. DTOs

**`create-order.dto.ts`** (nuevo):

```typescript
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const COLOMBIA_MOBILE = /^3\d{9}$/;

export class OrderItemModifierDto {
  @IsUUID()
  optionId!: string;

  @IsIn(['added', 'removed'])
  action!: 'added' | 'removed';

  /** Solo en `added` de un reemplazo gratis (§021): apunta al
   * ingrediente incluido agotado que esta opción reemplaza. */
  @IsUUID()
  @IsOptional()
  replacesOptionId?: string;
}

export class OrderItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemModifierDto)
  modifiers: OrderItemModifierDto[] = [];
}

export class NewAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/\S/)
  landmark!: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  neighborhood?: string;
}

export class CreateOrderDto {
  // Canal online — el cliente solo puede pickup|delivery (dine_in
  // llega con el admin, fuera de esta propuesta).
  @IsIn(['pickup', 'delivery'])
  serviceType!: 'pickup' | 'delivery';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  // delivery — la dirección guardada (mía) o una nueva no guardada.
  @IsUUID()
  @IsOptional()
  addressId?: string;

  @ValidateNested()
  @Type(() => NewAddressDto)
  @IsOptional()
  newAddress?: NewAddressDto;

  // §024 — quién recibe (delivery lo exige).
  @IsString()
  @Matches(COLOMBIA_MOBILE)
  @ValidateIf((o: CreateOrderDto) => o.serviceType === 'delivery')
  contactPhone?: string;

  // Pin de Google adjunto al pedido (§022d).
  @IsString()
  @IsOptional()
  @MaxLength(500)
  deliveryLocationLink?: string;

  // cash solo en delivery (§022c — el local exige transferencia).
  @IsIn(['cash', 'transfer'])
  paymentMethod!: 'cash' | 'transfer';

  // §024 — quién paga cuando transfer.
  @IsString()
  @Matches(COLOMBIA_MOBILE)
  @ValidateIf((o: CreateOrderDto) => o.paymentMethod === 'transfer')
  payerPhone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  /** Idempotencia: la app genera un uuid por checkout; un reintento
   * responde la misma orden. */
  @IsUUID()
  @IsOptional()
  clientRequestId?: string;
}
```

**`list-orders.query.dto.ts`**:

```typescript
export class ListOrdersQueryDto {
  @IsIn(['active', 'history'])
  @IsOptional()
  bucket: 'active' | 'history' = 'active';

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page = 1;

  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  @Type(() => Number)
  limit = 20;
}
```

**`cancel-order.dto.ts`**: `{ @IsString() @IsOptional() @MaxLength(300) reason?: string }`

**`order-response.dto.ts`**:

```typescript
export class OrderItemModifierResponseDto {
  id!: string;
  optionId!: string | null;
  optionName!: string;
  action!: string;
  priceDelta!: number;
}
export class OrderItemResponseDto {
  id!: string;
  productId!: string;
  productName!: string;
  unitPrice!: number;
  quantity!: number;
  lineTotal!: number;
  notes!: string | null;
  modifiers!: OrderItemModifierResponseDto[];
}
export class OrderPaymentResponseDto {
  id!: string;
  method!: string;
  status!: string;
  amount!: number;
  payerPhone!: string | null;
}
export class OrderResponseDto {
  id!: string;
  orderNumber!: number;
  orderDate!: string;
  status!: string;
  serviceType!: string;
  contactPhone!: string | null;
  deliveryAddress!: string | null;
  deliveryLocationLink!: string | null;
  subtotal!: number;
  deliveryFee!: number;
  discount!: number;
  total!: number;
  notes!: string | null;
  cancelReason!: string | null;
  createdAt!: Date;
  items!: OrderItemResponseDto[];
  payment!: OrderPaymentResponseDto | null;
}
export class OrderListResponseDto {
  items!: OrderResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
```

## 4. Use-cases

**`create-order.use-case.ts`** — la pieza central:

```typescript
@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: IOrderRepository,
    @Inject(CATALOG_REPOSITORY) private readonly catalog: ICatalogRepository,
    @Inject(STORE_REPOSITORY) private readonly store: IStoreRepository,
    @Inject(ADDRESS_REPOSITORY) private readonly addresses: IAddressRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(cmd: CreateOrderCommand): Promise<Order> {
    // 1. Idempotencia — un reintento responde la misma orden.
    if (cmd.clientRequestId) {
      const existing = await this.orders.findByClientRequest(
        cmd.customerId,
        cmd.clientRequestId,
      );
      if (existing) return existing;
    }
    // 2. Reglas de payload que el DTO no cruza (400 honestos).
    this.assertPayloadCombinations(cmd);
    // 3. Local abierto — el contrato se defiende solo.
    const [settings, hours] = await Promise.all([
      this.store.getSettings(),
      this.store.getBusinessHours(),
    ]);
    const tz = this.config.get<string>('store.timezone')!;
    if (!settings || !StoreSchedule.isOpenNow(hours, new Date(), tz)) {
      throw new StoreClosedException();
    }
    // 4. Revalidación de catálogo — precios SIEMPRE de la BD.
    const menu = await this.catalog.getOrderableProducts(
      cmd.items.map((i) => i.productId),
    );
    const items = this.buildValidatedItems(cmd.items, menu);
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
    // 5. Reglas de servicio/pago y snapshots.
    const deliveryFee =
      cmd.serviceType === 'delivery' ? settings.deliveryFee : 0;
    if (
      cmd.serviceType === 'delivery' &&
      settings.minDeliveryOrder !== null &&
      subtotal < settings.minDeliveryOrder
    ) {
      throw new MinOrderAmountException(settings.minDeliveryOrder);
    }
    const order = new Order();
    order.customerId = cmd.customerId;
    order.channel = OrderChannel.ONLINE;
    order.serviceType = cmd.serviceType as OrderServiceType;
    order.clientRequestId = cmd.clientRequestId ?? null;
    order.orderDate = StoreSchedule.zonedNow(new Date(), tz).date;
    order.subtotal = subtotal;
    order.deliveryFee = deliveryFee;
    order.total = subtotal + deliveryFee;
    order.notes = cmd.notes?.trim() || null;
    order.items = items;
    // contact_phone §024 — solo delivery; pickup lo rechaza en paso 2.
    order.contactPhone = cmd.contactPhone ?? null;
    order.deliveryLocationLink = cmd.deliveryLocationLink ?? null;
    await this.fillDeliverySnapshot(cmd, order);  // addressId XOR newAddress
    order.payment = this.buildPayment(cmd, order.total);
    return this.orders.createAggregate(order);
  }
}
```

`buildValidatedItems` — corazón de la revalidación (método privado):

```typescript
// Por cada ítem del payload (nunca se confía en precios del cliente):
for (const dto of dtos) {
  const product = menu.get(dto.productId);
  if (!product || !product.isAvailable) {
    throw new OrderCatalogViolationException(
      `product ${dto.productId} unavailable`,
    );
  }
  const options = flattenOptions(product); // {option → {opt, includedByDefault}}
  // Una opción incluida ESENCIAL agotada agota el producto (§010/011).
  if ([...options.values()].some(
    (o) => o.includedByDefault && o.opt.isEssential && !o.opt.isAvailable,
  )) {
    throw new OrderCatalogViolationException(
      `product ${product.name} unavailable (essential out)`,
    );
  }
  const seen = new Set<string>();
  const mods: OrderItemModifier[] = [];
  for (const m of dto.modifiers) {
    if (seen.has(m.optionId)) {
      throw new OrderCatalogViolationException('duplicate modifier');
    }
    seen.add(m.optionId);
    const entry = options.get(m.optionId);
    if (!entry) {
      throw new OrderCatalogViolationException(
        `option ${m.optionId} not for product`,
      );
    }
    if (m.action === 'removed') {
      if (!entry.includedByDefault || !entry.opt.isRemovable) {
        throw new OrderCatalogViolationException(
          `option ${entry.opt.name} cannot be removed`,
        );
      }
      mods.push(this.modifier(entry.opt, 'removed', 0));
      continue;
    }
    // added — ¿extra cobrado o reemplazo gratis (§021)?
    if (!entry.opt.isAvailable) {
      throw new OrderCatalogViolationException(
        `option ${entry.opt.name} unavailable`,
      );
    }
    let delta = entry.opt.extraPrice;
    if (m.replacesOptionId) {
      const replaced = options.get(m.replacesOptionId);
      const hasRemovedRow = dto.modifiers.some(
        (x) => x.optionId === m.replacesOptionId && x.action === 'removed',
      );
      const ok =
        replaced?.includedByDefault &&
        replaced.opt.isReplaceable &&
        entry.opt.isReplacementEligible &&
        hasRemovedRow;
      if (!ok) {
        throw new OrderCatalogViolationException(
          `invalid free replacement of ${entry.opt.name}`,
        );
      }
      delta = 0;
    }
    mods.push(this.modifier(entry.opt, 'added', delta));
  }
  const unit = product.basePrice +
    mods.filter((m) => m.action === 'added').reduce((s, m) => s + m.priceDelta, 0);
  // …arma OrderItem con snapshots
}
```

`assertPayloadCombinations` — los 400 de combinación:

```typescript
// pickup + cash           → 'Pickup orders must be paid by transfer'
// pickup + contactPhone   → 'contactPhone only applies to delivery'
// transfer + !payerPhone  → 'payerPhone is required for transfer'
// cash + payerPhone       → 'payerPhone only applies to transfer'
// delivery + !contactPhone→ 'contactPhone is required for delivery'
// delivery + (addressId XOR newAddress) — ni ambos ni ninguno
// pickup  + (addressId|newAddress|deliveryLocationLink) → 400
```

`buildPayment` — la fila inicial:

```typescript
const p = new Payment();
p.method = cmd.paymentMethod as PaymentMethod;   // 'cash' | 'transfer'
p.status = PaymentStatus.PENDING;
p.amount = order.total;
p.payerPhone = cmd.paymentMethod === 'transfer' ? cmd.payerPhone! : null;
// provider NULL — el adapter Nequi llega en su propuesta (010).
```

`fillDeliverySnapshot`:

```typescript
if (cmd.serviceType !== 'delivery') return;
if (cmd.addressId) {
  const addr = await this.addresses.findByIdForUser(cmd.addressId, cmd.customerId);
  if (!addr) throw new AddressNotFoundException(); // de auth — reuso
  order.addressId = addr.id;
  order.deliveryAddress = this.snapshot(addr); // landmark (+ barrio)
} else {
  const n = cmd.newAddress!;
  order.deliveryAddress = this.snapshotText(n.landmark, n.neighborhood);
}
// snapshot: "Casa blanca frente a la cancha (Barrio Centro)" —
// comanda-friendly; el landmark SIEMPRE primero (§022a).
```

**`list-my-orders.use-case.ts`**:

```typescript
execute({customerId, bucket, page, limit}) →
  this.orders.findByCustomer(customerId, bucket, page, limit)
```

**`get-my-order.use-case.ts`**:

```typescript
const order = await this.orders.findByIdForCustomer(cmd.orderId, cmd.customerId);
if (!order) throw new OrderNotFoundException();
return order;
```

**`cancel-my-order.use-case.ts`**:

```typescript
const order = await this.orders.findByIdForCustomer(cmd.orderId, cmd.customerId);
if (!order) throw new OrderNotFoundException();
if (order.status !== OrderStatus.PENDING) {
  throw new OrderNotCancellableException();
}
order.status = OrderStatus.CANCELLED;
order.cancelReason = cmd.reason?.trim() || null;
// Pago pendiente → failed en la misma tx — sin huérfanos de push.
if (order.payment?.status === PaymentStatus.PENDING) {
  order.payment.status = PaymentStatus.FAILED;
}
return this.orders.saveAggregate(order);
```

## 5. Infraestructura

**`order.repository.ts`** — el agregado en una tx:

```typescript
createAggregate(order: Order): Promise<Order> {
  return this.orm.manager.transaction(async (em) => {
    // Consecutivo diario: MAX+1 protegido por UNIQUE — la colisión
    // reintenta (max 3) fuera de esta capa: el use-case llama a un
    // wrapper o el repo reintenta aquí con la excepción 23505.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        order.orderNumber = await this.nextNumber(em, order.orderDate);
        const saved = await em.save(order);
        for (const item of order.items) {
          item.orderId = saved.id;
          const savedItem = await em.save(item);
          for (const mod of item.modifiers) {
            mod.orderItemId = savedItem.id;
            await em.save(mod);
          }
        }
        if (order.payment) {
          order.payment.orderId = saved.id;
          order.payment = await em.save(order.payment);
        }
        saved.items = order.items;
        saved.payment = order.payment;
        return saved;
      } catch (e) {
        if (attempt === 2 || !isUniqueViolation(e)) throw e;
      }
    }
    throw new Error('unreachable');
  });
}

private async nextNumber(em: EntityManager, orderDate: string) {
  const row = await em.query(
    `SELECT COALESCE(MAX(order_number),0)+1 AS n
     FROM orders WHERE order_date = $1 FOR UPDATE`,
    [orderDate],
  );
  return row[0].n as number;
}
```

`findByCustomer` — dos queries batcheadas (sin N+1): orders del
bucket+paginación, luego `items WHERE order_id IN (...)` y
`payment WHERE order_id IN (...)` y se arman en memoria. Items sin
modifiers en el listado (`modifiers: []` en respuesta).

`findByIdForCustomer` — lo mismo + modifiers (`WHERE order_item_id
IN (...)`) para el detalle.

`saveAggregate` — `em.save(order)` + `em.save(order.payment)` si
existe, en una tx.

## 6. Catálogo — finder de revalidación

`ICatalogRepository` gana:

```typescript
/**
 * Productos por ids con su árbol de modificadores resuelto para
 * REVALIDAR un pedido: options con extraPrice/isAvailable/
 * isRemovable/isReplaceable/isReplacementEligible/isEssential e
 * includedByDefault por producto. Incluye isAvailable=false para
 * que el use-case distinga "agotado" de "no existe".
 */
getOrderableProducts(productIds: string[]): Promise<Product[]>;
```

Impl en `catalog.repository.ts` — mismo join que `getMenu` acotado
por `product.id IN (:ids)` y sin imágenes (el pedido no las usa).
Sin `isAvailable` filter en la query — el use-case decide.

## 7. Módulos — exports para consumo cross-módulo

```typescript
// catalog.module.ts → exports: [CATALOG_REPOSITORY]
// store.module.ts   → exports: [STORE_REPOSITORY]
// auth.module.ts    → exports: [ADDRESS_REPOSITORY]
```

`orders.module.ts` (nuevo):

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderSchema,
      OrderItemSchema,
      OrderItemModifierSchema,
      PaymentSchema,
    ]),
    CatalogModule,
    StoreModule,
    AuthModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderMapper,
    CreateOrderUseCase,
    ListMyOrdersUseCase,
    GetMyOrderUseCase,
    CancelMyOrderUseCase,
    { provide: ORDER_REPOSITORY, useClass: OrderRepository },
  ],
})
export class OrdersModule {}
```

`app.module.ts` → `+ OrdersModule` en imports.

## 8. Controller

```typescript
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.userId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() q: ListOrdersQueryDto) {
    return this.ordersService.list(user.userId, q);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.detail(user.userId, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto) {
    return this.ordersService.cancel(user.userId, id, dto);
  }
}
```

Service delega + arma DTOs vía `OrderMapper` (domain → response; los
use-cases devuelven entidades — strict-layering). El service marca la
respuesta de `create` idempotente igual que una normal (201 siempre —
el índice garantiza que es LA orden del cliente).

## 9. Schemas

`order.schema.ts` + `contactPhone`/`deliveryLocationLink`/
`clientRequestId` (`varchar(20)`, `text`, `uuid` nullable).
`payment.schema.ts` + `payerPhone` (`varchar(20)` nullable).

## 10. Tests

- **Unitarios**:
  - `create-order.use-case.spec.ts` — la batería gorda: idempotencia
    (clientRequestId existente devuelve la misma), cerrado → 409,
    cash+pickup → 400, transfer sin payerPhone → 400, delivery sin
    contactPhone → 400, addressId ajeno → 404, producto agotado →
    409, esencial agotado → 409, modifier inválido/no-del-producto →
    409, removed de no-removible → 409, added agotado → 409,
    reemplazo gratis válido → delta 0, reemplazo inválido → 409,
    duplicado → 409, cálculo subtotal+fee+total, min_delivery_order
    → 409, snapshot de dirección.
  - `list-my-orders.use-case.spec.ts`, `get-my-order.use-case.spec.ts`
    (404 ajeno), `cancel-my-order.use-case.spec.ts` (pending→cancel+
    payment failed; confirmed → 409; ajeno → 404).
  - `order.repository.spec.ts` — tx del agregado, retry 23505,
    findByCustomer por bucket, IDOR del findByIdForCustomer.
  - `order.mapper.spec.ts`.
- **e2e** `test/orders/orders.e2e-spec.ts` — seed de menú como
  `get-catalog.e2e-spec.ts` (helpers en `test/support/e2e-app.ts`:
  truncate + orders/payments + seedStore con settings+hours abiertos):
  1. `POST` pickup+transfer+payerPhone → 201 con order_number=1,
     total = base+delta, payment pending transfer con payer_phone.
  2. `POST` delivery+addressId+contactPhone+cash → 201 snapshot
     delivery_address + fee.
  3. `POST` delivery+newAddress → 201 snapshot sin address_id.
  4. `POST` mismo clientRequestId → 201 con el MISMO id (idempotente).
  5. `POST` pickup+cash → 400 · transfer sin payerPhone → 400 ·
     delivery sin contactPhone → 400.
  6. `POST` producto agotado / modificador ajeno / removed no-
     removible → 409.
  7. `GET /orders?bucket=active` → la del paso 1-3; `bucket=history`
     con paginación envelope.
  8. `GET /orders/:id` mío → 200; de otro usuario → 404.
  9. `POST /orders/:id/cancel` en pending → status cancelled +
     payment failed; recancel → 409; ajeno → 404.
  10. sin token → 401 en los 4.
  11. `POST` con local cerrado (hours sin franja actual) → 409.

- **Docs**: `documentacion/api/orders/001-post-orders.md` …
  `004-post-orders-id-cancel.md` + filas en README +
  `modelo-de-datos.md` (orders: contact_phone/delivery_location_link/
  client_request_id implementados; payments: payer_phone).

---

## Orden de aplicación recomendado

1. `orders.controller.ts` stub → `orders.service.ts` stub
2. DTOs (create/query/cancel/response) + entity/schema updates
3. Migración escrita a mano → run dev+test → revert+re-run en test
4. Excepciones → `order.repository.interface.ts` → `order.repository.ts`
5. `catalog` finder + exports ×3
6. Use-cases ×4 → service/controller completos → `orders.module.ts`
   → `app.module.ts`
7. Specs unitarios + e2e → `npm run test` + `test:e2e`
8. Docs API + README + modelo-de-datos.md
9. `npx tsc --noEmit` + suite completa verde

---

## §015a — Registro de implementación y auditoría

Implementada y auditada. Verificación final: `tsc --noEmit` limpio,
**215** tests unitarios (46 suites), **91** e2e (16 suites — 12 del
módulo orders), migración `AddOrderPhonesAndLocationLink1794060585949`
corrida en dev y test con `revert`+`re-run` verificados.

Correcciones aplicadas sobre el draft tras la auditoría del revisor:

1. **CRÍTICO — reemplazo gratis de un solo uso.** El draft validaba
   cada fila `added` con `replacesOptionId` de forma independiente:
   N extras podían reclamar el mismo `removed` y salir todos con
   `price_delta=0` (bypass directo de precio). Ahora cada ítem lleva
   `consumedReplacements` — la segunda reclamación del mismo
   `replacesOptionId` → 409. Cubierto con spec unitario y caso e2e
   (dos `added` sobre el mismo `removed` de mozzarella).
2. **IMPORTANTE — carrera de idempotencia devolvía 500.** Dos POST
   concurrentes con el mismo `clientRequestId`: el perdedor chocaba
   con `uq_orders_client_request` y el retry ciego reintentaba la
   misma colisión → 500. El catch ahora distingue por nombre de
   constraint: `uq_orders_client_request` → `findByClientRequest` y
   devuelve la orden ganadora (el 23505 espera el commit de la tx
   concurrente — ya es visible); solo `uq_orders_day_number`
   reintenta. Spec nuevo cubre el camino.
3. **IMPORTANTE — producto en categoría inactiva era ordenable.**
   `getOrderableProducts` filtraba `deletedAt` pero no la categoría:
   un `productId` cacheado seguía pidiendo aunque la carta la hubiera
   ocultado. Ahora filtra `categoryId IN (activas)` — mismo patrón
   de `getMenu`. Caso e2e: `isActive=false` → 409.
4. **MENOR — techos de payload.** `@ArrayMaxSize(30)` en items y
   `@ArrayMaxSize(20)` en modifiers — la tx queda acotada.
5. **MENOR — `throw new Error('unreachable')`** reemplazado por el
   patrón `lastError` tras el loop de retry.
6. **MENOR — `contactPhone: ''` en pickup** persistía cadena vacía;
   ahora `?.trim() || null` → NULL.

Aceptado como trade-off (INFO del revisor, documentado): TOCTOU en
cancel — el check `status==='pending'` vive fuera de la tx; si un
admin confirmara en la ventana, el cancel pisaría el estado. Riesgo
nulo hoy (no existen endpoints de admin); si llegan, cerrar con
`UPDATE ... WHERE status='pending'` + rowcount. `FOR UPDATE` del
consecutivo fue removido correctamente — PG no lo permite sobre
agregados; MAX+1+UNIQUE+retry es la estrategia correcta.
