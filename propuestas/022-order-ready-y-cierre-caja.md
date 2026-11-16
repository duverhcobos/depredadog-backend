# Propuesta: estados `preparing`/`ready` + cierre de caja del día (kanban Cocina)

El dueño rediseñó Cocina: la cola es un **kanban de 5 carriles** y el
pedido entregado NO desaparece — queda visible hasta el **cierre de
caja** manual de fin de día, que lo archiva al historial con un
resumen de plata (total + desglose por método + # pedidos + conteo de
cancelados como contexto).

Cambios de contrato:

1. `OrderStatus` gana `ready` y `preparing` **deja de ser valor muerto**
   (la decisión §019 del flujo corto se revoca por la del kanban):
   `pending → confirmed → preparing → ready → done`
   (labels por canal los pone la app: `ready` = delivery "Va en
   camino" / dine_in "Servido" / pickup "Listo p/recoger" —
   `serviceType` ya viaja en el response). Carriles:
   Pendiente | Confirmado | Preparando | Listo | Entregado.
2. `orders.day_close_id` NULL → `day_closes.id`. Semántica de
   buckets: `active` = pendientes/en-curso **+ done sin cerrar**;
   `history` = done cerrados + cancelados. El cierre estampa TAMBIÉN
   los `cancelled` sin cerrar — no para archivarlos (ya están en
   historial) sino para atarlos al periodo y poder contarlos en el
   resumen. Un `done` sigue liberando la mesa igual (el índice "mesa
   ocupada" es por status, no por cierre).
3. `day_closes` — registro auditable del cierre: quién cerró, cuándo,
   cuántos pedidos, total, desglose por método y cancelados del
   periodo (snapshot — no se recalcula, un cierre es un hecho).
   **Cierre vacío permitido**: un día sin entregados deja registro
   con ceros como bitácora — no hay `NOTHING_TO_CLOSE`.
4. Endpoints: `GET /admin/day-close` (preview de lo que cerraría —
   solo lectura) y `POST /admin/day-close` (ejecuta: crea el registro
   y reclama atómicamente todos los terminales sin cerrar).

**Fuera de alcance**: listado de cierres anteriores (`GET
/admin/day-closes` — la tabla queda lista, el endpoint llega con el
módulo de reportes), edición de un cierre, cierre automático por
hora, UI de la app (propuesta propia con mocks primero).

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/orders/presentation/controllers/admin-orders.controller.ts` | +`GET /admin/day-close` + `POST /admin/day-close` |
| `src/modules/orders/application/dtos/close-day.dto.ts` | nuevo — `note?` |
| `src/modules/orders/application/dtos/day-close.response.dto.ts` | nuevo — preview + resultado |
| `src/modules/orders/domain/enums/order-status.enum.ts` | +`READY` |
| `src/modules/orders/application/use-cases/update-order-status.use-case.ts` | matriz `confirmed→preparing→ready→done` |
| `src/modules/orders/domain/entities/order.entity.ts` | +`dayCloseId` |
| `src/modules/orders/domain/entities/day-close.entity.ts` | nuevo |
| `src/modules/orders/domain/repositories/day-close.repository.interface.ts` | nuevo |
| `src/modules/orders/domain/repositories/order.repository.interface.ts` | +`findUnclosedTerminal` + `claimUnclosedTerminal` + doc buckets |
| `src/modules/orders/infrastructure/repositories/order.repository.ts` | predicados de bucket + 2 métodos |
| `src/modules/orders/infrastructure/repositories/day-close.repository.ts` | nuevo — impl TypeORM |
| `src/infrastructure/database/schemas/order.schema.ts` | +`day_close_id` + relación |
| `src/infrastructure/database/schemas/day-close.schema.ts` | nuevo |
| `src/infrastructure/database/migrations/<ts>-AddReadyStatusAndDayCloses.ts` | nueva — enum + tabla + columna |
| `src/infrastructure/database/migrations/<ts>-AddOrderStatusChangedAt.ts` | nueva — columna `status_changed_at` + backfill (Adición §037.A) |
| `src/modules/orders/application/dtos/order-response.dto.ts` | +`statusChangedAt` (Adición §037.A) |
| `src/modules/orders/application/dtos/admin-order-response.dto.ts` | +`deliveryAddressLabel`/`deliveryLandmark`/`deliveryNeighborhood` (Adición §037.B) |
| `src/modules/orders/infrastructure/repositories/order.repository.ts` | join `order.address` en admin list/detail (Adición §037.B) |
| `src/modules/orders/application/use-cases/confirm-payment.use-case.ts` | cobra Y avanza (received→confirmed, ready→done) — Adición §037.D |
| `src/modules/orders/application/use-cases/preview-day-close.use-case.ts` | nuevo |
| `src/modules/orders/application/use-cases/close-day.use-case.ts` | nuevo |
| `src/modules/orders/application/services/orders.service.ts` | +`previewDayClose` + `closeDay` |
| `src/modules/orders/orders.module.ts` | providers + schema |
| `documentacion/api/admin/006-get-admin-day-close.md` | nuevo |
| `documentacion/api/admin/007-post-admin-day-close.md` | nuevo |
| `documentacion/api/admin/001-get-admin-orders.md` | actualizar buckets |
| `documentacion/api/admin/002-patch-admin-orders-id-status.md` | actualizar matriz |
| Specs + e2e | ver secciones finales |

---

## 1. admin-orders.controller.ts (archivo existente — actualización)

**Ruta:** `src/modules/orders/presentation/controllers/admin-orders.controller.ts`

**Antes:**
```typescript
  @Get('tables')
  getTables(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.listAdminTables(user.userId);
  }
}
```

**Después:**
```typescript
  @Get('tables')
  getTables(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.listAdminTables(user.userId);
  }

  @Get('day-close')
  previewDayClose(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.previewDayClose(user.userId);
  }

  @Post('day-close')
  @HttpCode(201)
  closeDay(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CloseDayDto,
  ) {
    return this.ordersService.closeDay(user.userId, dto);
  }
}
```

(con el import de `CloseDayDto`)

## 2. close-day.dto.ts (archivo nuevo)

**Ruta:** `src/modules/orders/application/dtos/close-day.dto.ts`

```typescript
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CloseDayDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

## 3. day-close.response.dto.ts (archivo nuevo)

**Ruta:** `src/modules/orders/application/dtos/day-close.response.dto.ts`

El preview y el resultado comparten el cuerpo; el resultado agrega
`id` + `closedAt`. `cancelledCount`/`cancelledAmount` son el
contexto que pidió el dueño ("2 cancelados") — no suman al total.

```typescript
export class DayCloseOrderDto {
  id!: string;
  orderNumber!: number;
  total!: number;
  paymentMethod!: string;
}

export class DayCloseMethodDto {
  method!: string;
  count!: number;
  amount!: number;
}

export class DayClosePreviewResponseDto {
  orderCount!: number;
  totalAmount!: number;
  byMethod!: DayCloseMethodDto[];
  cancelledCount!: number;
  cancelledAmount!: number;
  orders!: DayCloseOrderDto[];
}

export class DayCloseResponseDto extends DayClosePreviewResponseDto {
  id!: string;
  closedAt!: string;
  note!: string | null;
}
```

## 4. (eliminada — cierre vacío permitido por decisión del dueño)

No hay excepción `NothingToCloseException`: un cierre sin pedidos
deja registro con ceros como bitácora del día perdido.

## 5. order-status.enum.ts (archivo existente — actualización)

**Ruta:** `src/modules/orders/domain/enums/order-status.enum.ts`

**Antes:**
```typescript
export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  DONE = 'done',
  CANCELLED = 'cancelled',
}
```

**Después:**
```typescript
export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  READY = 'ready',
  DONE = 'done',
  CANCELLED = 'cancelled',
}
```

## 6. update-order-status.use-case.ts (archivo existente — actualización)

**Ruta:** `src/modules/orders/application/use-cases/update-order-status.use-case.ts`

**Antes:**
```typescript
// Matriz del flujo corto SIN 'preparing' (decisión usuario §019):
// pending→confirmed→done + cancelled en cualquier punto no terminal.
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  pending: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  confirmed: [OrderStatus.DONE, OrderStatus.CANCELLED],
  preparing: [OrderStatus.DONE, OrderStatus.CANCELLED], // inalcanzable por contrato
  done: [],
  cancelled: [],
};
```

**Después:**
```typescript
// pending→confirmed→preparing→ready→done + cancelled en cualquier
// no terminal — el kanban Cocina de 5 carriles (§022): 'preparing'
// pasa a ser real (decisión del dueño, revoca §019) y 'ready' es el
// paso intermedio que la app etiqueta por serviceType
// ("Va en camino"/"Servido"/"Listo p/recoger").
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  pending: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  confirmed: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  preparing: [OrderStatus.READY, OrderStatus.CANCELLED],
  ready: [OrderStatus.DONE, OrderStatus.CANCELLED],
  done: [],
  cancelled: [],
};
```

El resto del use-case no cambia: `done` sigue exigiendo
`payment.status === PAID` (no se entrega sin cobrar) y el cancel
sigue matando el pago pendiente.

## 7. order.entity.ts (archivo existente — actualización)

**Ruta:** `src/modules/orders/domain/entities/order.entity.ts`

**Antes:**
```typescript
  status: OrderStatus = OrderStatus.PENDING;
```

**Después:**
```typescript
  status: OrderStatus = OrderStatus.PENDING;
  /** Cierre de caja que archivó la orden — NULL = aún visible en Cocina. */
  dayCloseId: string | null = null;
```

## 8. day-close.entity.ts (archivo nuevo)

**Ruta:** `src/modules/orders/domain/entities/day-close.entity.ts`

```typescript
export interface DayCloseMethodBreakdown {
  method: string;
  count: number;
  amount: number;
}

export class DayClose {
  id!: string;
  closedBy!: string;
  closedAt!: Date;
  orderCount!: number;
  totalAmount!: number;
  cancelledCount!: number;
  cancelledAmount!: number;
  methodBreakdown!: DayCloseMethodBreakdown[];
  note: string | null = null;
  createdAt!: Date;
}
```

## 9. day-close.repository.interface.ts (archivo nuevo)

**Ruta:** `src/modules/orders/domain/repositories/day-close.repository.interface.ts`

```typescript
import { EntityManager } from 'typeorm';
import { DayClose } from '../entities/day-close.entity';

export interface IDayCloseRepository {
  save(close: DayClose, em?: EntityManager): Promise<DayClose>;
}

export const DAY_CLOSE_REPOSITORY = Symbol('IDayCloseRepository');
```

## 10. order.repository.interface.ts (archivo existente — actualización)

**Ruta:** `src/modules/orders/domain/repositories/order.repository.interface.ts`

**Antes:**
```typescript
  /** Cola del dueño — sin filtro de cliente (presenciales con NULL). */
  findForAdmin(
    bucket: 'active' | 'history',
    page: number,
    limit: number,
  ): Promise<OrderListPage>;
```

**Después:**
```typescript
  /**
   * Cola del dueño — sin filtro de cliente (presenciales con NULL).
   * Buckets (§022):
   * - active  = pending/confirmed/ready/preparing + done SIN cerrar
   *             (el entregado sigue en Cocina hasta el cierre de caja)
   * - history = done con day_close_id + cancelled (cualquier fecha)
   */
  findForAdmin(
    bucket: 'active' | 'history',
    page: number,
    limit: number,
  ): Promise<OrderListPage>;
  /** Pedidos terminales (done/cancelled) sin cerrar — preview (sin lock). */
  findUnclosedTerminal(): Promise<Order[]>;
  /**
   * Claim atómico del cierre: UPDATE orders SET day_close_id
   * WHERE status IN ('done','cancelled') AND day_close_id IS NULL
   * dentro de `em`, luego devuelve las filas reclamadas con su
   * payment cargado. Los cancelled se estampan para atarlos al
   * periodo del cierre (contexto "N cancelados" del resumen) — ya
   * vivían en historial por su status.
   */
  claimUnclosedTerminal(dayCloseId: string, em: EntityManager): Promise<Order[]>;
```

## 11. order.repository.ts (archivo existente — actualización)

**Ruta:** `src/modules/orders/infrastructure/repositories/order.repository.ts`

**Predicados de bucket en `findForAdmin`:**

**Antes (la cláusula `where` según bucket):**
```typescript
    const where: FindOptionsWhere<OrderSchema> =
      bucket === 'active'
        ? { status: In([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING]) }
        : { status: In([OrderStatus.DONE, OrderStatus.CANCELLED]) };
```

**Después:**
```typescript
    const where: FindOptionsWhere<OrderSchema>[] | FindOptionsWhere<OrderSchema> =
      bucket === 'active'
        ? [
            {
              status: In([
                OrderStatus.PENDING,
                OrderStatus.CONFIRMED,
                OrderStatus.READY,
                OrderStatus.PREPARING,
              ]),
            },
            { status: OrderStatus.DONE, dayCloseId: IsNull() },
          ]
        : [
            { status: OrderStatus.CANCELLED },
            { dayCloseId: Not(IsNull()) },
          ];
```

**Métodos nuevos (al final de la clase):**
```typescript
  async findUnclosedTerminal(): Promise<Order[]> {
    const rows = await this.repo.find({
      where: [
        { status: OrderStatus.DONE, dayCloseId: IsNull() },
        { status: OrderStatus.CANCELLED, dayCloseId: IsNull() },
      ],
      relations: { payment: true },
      order: { updatedAt: 'ASC' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async claimUnclosedTerminal(
    dayCloseId: string,
    em: EntityManager,
  ): Promise<Order[]> {
    const claimed = await em
      .createQueryBuilder(OrderSchema, 'o')
      .update()
      .set({ dayCloseId })
      .where("status IN ('done','cancelled') AND day_close_id IS NULL")
      .returning('id')
      .execute();
    const ids = (claimed.raw as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return [];
    const rows = await em.getRepository(OrderSchema).find({
      where: { id: In(ids) },
      relations: { payment: true },
      order: { updatedAt: 'ASC' },
    });
    return rows.map((r) => this.toDomain(r));
  }
```

## 12. day-close.repository.ts (archivo nuevo)

**Ruta:** `src/modules/orders/infrastructure/repositories/day-close.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  type IDayCloseRepository,
} from '../../domain/repositories/day-close.repository.interface';
import { DayClose } from '../../domain/entities/day-close.entity';
import { DayCloseSchema } from '../../../../infrastructure/database/schemas/day-close.schema';

@Injectable()
export class DayCloseRepository implements IDayCloseRepository {
  constructor(
    @InjectRepository(DayCloseSchema)
    private readonly repo: Repository<DayCloseSchema>,
  ) {}

  async save(close: DayClose, em?: EntityManager): Promise<DayClose> {
    const repo = em ? em.getRepository(DayCloseSchema) : this.repo;
    const saved = await repo.save(this.toSchema(close));
    return this.toDomain(saved);
  }

  private toSchema(c: DayClose): DayCloseSchema {
    const s = new DayCloseSchema();
    s.id = c.id;
    s.closedBy = c.closedBy;
    s.closedAt = c.closedAt;
    s.orderCount = c.orderCount;
    s.totalAmount = c.totalAmount;
    s.cancelledCount = c.cancelledCount;
    s.cancelledAmount = c.cancelledAmount;
    s.methodBreakdown = c.methodBreakdown;
    s.note = c.note;
    return s;
  }

  private toDomain(s: DayCloseSchema): DayClose {
    const c = new DayClose();
    c.id = s.id;
    c.closedBy = s.closedBy;
    c.closedAt = s.closedAt;
    c.orderCount = s.orderCount;
    c.totalAmount = s.totalAmount;
    c.cancelledCount = s.cancelledCount;
    c.cancelledAmount = s.cancelledAmount;
    c.methodBreakdown = s.methodBreakdown;
    c.note = s.note;
    c.createdAt = s.createdAt;
    return c;
  }
}
```

## 13. day-close.schema.ts (archivo nuevo)

**Ruta:** `src/infrastructure/database/schemas/day-close.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { numeric } from '../transformers/numeric.transformer';

export class DayCloseSchema {
  id!: string;
  closedBy!: string;
  closedAt!: Date;
  orderCount!: number;
  totalAmount!: number;
  cancelledCount!: number;
  cancelledAmount!: number;
  methodBreakdown!: { method: string; count: number; amount: number }[];
  note!: string | null;
  createdAt!: Date;
}

export const DayCloseEntity = new EntitySchema<DayCloseSchema>({
  name: 'DayClose',
  tableName: 'day_closes',
  target: DayCloseSchema,
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    closedBy: { name: 'closed_by', type: 'uuid' },
    closedAt: { name: 'closed_at', type: 'timestamptz' },
    orderCount: { name: 'order_count', type: 'int' },
    totalAmount: {
      name: 'total_amount',
      type: 'numeric',
      precision: 12,
      scale: 2,
      transformer: numeric,
    },
    cancelledCount: { name: 'cancelled_count', type: 'int', default: 0 },
    cancelledAmount: {
      name: 'cancelled_amount',
      type: 'numeric',
      precision: 12,
      scale: 2,
      transformer: numeric,
      default: 0,
    },
    methodBreakdown: { name: 'method_breakdown', type: 'jsonb' },
    note: { type: 'text', nullable: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
  },
});

export default DayCloseEntity;
```

(Verificar el nombre exacto del transformer `numeric` y el patrón
de export contra `order.schema.ts` al implementar — mismo archivo
de import.)

## 14. order.schema.ts (archivo existente — actualización)

**Ruta:** `src/infrastructure/database/schemas/order.schema.ts`

**Antes:**
```typescript
    status: {
      type: 'enum',
      enum: OrderStatus,
      enumName: 'order_status',
```

**Después:**
```typescript
    status: {
      type: 'enum',
      enum: OrderStatus,
      enumName: 'order_status',
      // (sin cambios — solo contexto)
    },
    dayCloseId: { name: 'day_close_id', type: 'uuid', nullable: true },
```

(ajustar la posición real en el archivo: `dayCloseId` como columna
nueva al final del bloque `columns`, y agregar la relación
`dayClose` → `DayClose` en el bloque `relations` siguiendo el patrón
de las relaciones existentes.)

## 15. Migración (archivo nuevo)

**Ruta:** `src/infrastructure/database/migrations/<ts>-AddReadyStatusAndDayCloses.ts`

- `ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'ready'` (en
  statement aparte — las enum-add no van dentro de tx con uso
  inmediato; aquí solo se agrega, no se usa).
- `CREATE TABLE day_closes` con las columnas del schema (incluidas
  `cancelled_count`/`cancelled_amount` con default 0) +
  `FOREIGN KEY (closed_by) REFERENCES users(id)`.
- `ALTER TABLE orders ADD COLUMN day_close_id uuid NULL` +
  `FOREIGN KEY REFERENCES day_closes(id)` +
  `CREATE INDEX ... ON orders(day_close_id) WHERE day_close_id IS NULL`
  (la cola activa filtra por "done sin cerrar" — índice parcial).
- `down()`: drop index, drop column, drop table, y el valor del enum
  se documenta como no-removable (conversión PG — recrear el tipo si
  se exige revert completo, siguiendo la convención de la migración
  de orders).

## 16. preview-day-close.use-case.ts (archivo nuevo)

**Ruta:** `src/modules/orders/application/use-cases/preview-day-close.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { Order } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import {
  DayCloseMethodBreakdown,
} from '../../domain/entities/day-close.entity';

export interface DayCloseSummary {
  orderCount: number;
  totalAmount: number;
  byMethod: DayCloseMethodBreakdown[];
  cancelledCount: number;
  cancelledAmount: number;
  orders: { id: string; orderNumber: number; total: number; paymentMethod: string }[];
}

export function buildDayCloseSummary(orders: Order[]): DayCloseSummary {
  const byMethod = new Map<string, { count: number; amount: number }>();
  const cancelled = orders.filter((o) => o.status === OrderStatus.CANCELLED);
  const items = orders
    .filter((o) => o.status === OrderStatus.DONE)
    .map((o) => {
      const method = o.payment?.method ?? 'unknown';
      const m = byMethod.get(method) ?? { count: 0, amount: 0 };
      m.count += 1;
      m.amount += o.total;
      byMethod.set(method, m);
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        total: o.total,
        paymentMethod: method,
      };
    });
  return {
    orderCount: items.length,
    totalAmount: items.reduce((acc, i) => acc + i.total, 0),
    byMethod: [...byMethod.entries()].map(([method, v]) => ({
      method,
      count: v.count,
      amount: v.amount,
    })),
    cancelledCount: cancelled.length,
    cancelledAmount: cancelled.reduce((acc, o) => acc + o.total, 0),
    orders: items,
  };
}

@Injectable()
export class PreviewDayCloseUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
  ) {}

  async execute(): Promise<DayCloseSummary> {
    const orders = await this.orders.findUnclosedTerminal();
    return buildDayCloseSummary(orders);
  }
}
```

(El invariante de transición ya garantiza "done ⇒ paid" — el
summary usa el método del pago, no su status.)

## 17. close-day.use-case.ts (archivo nuevo)

**Ruta:** `src/modules/orders/application/use-cases/close-day.use-case.ts`

Todo en una tx: crea el registro → claim atómico de los terminales
sin cerrar (done + cancelled) → snapshot al registro. **Cierre
vacío permitido** (decisión del dueño): si no hay nada que cerrar,
el registro queda con ceros como bitácora. Un doble-tap crea un
segundo cierre vacío — comportamiento aceptado (la app lo previene
visualmente con el estado busy).

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DayClose } from '../../domain/entities/day-close.entity';
import {
  type IDayCloseRepository,
  DAY_CLOSE_REPOSITORY,
} from '../../domain/repositories/day-close.repository.interface';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { buildDayCloseSummary, DayCloseSummary } from './preview-day-close.use-case';

export interface CloseDayCommand {
  adminId: string;
  note?: string;
}

export interface CloseDayResult extends DayCloseSummary {
  id: string;
  closedAt: Date;
  note: string | null;
}

@Injectable()
export class CloseDayUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
    @Inject(DAY_CLOSE_REPOSITORY)
    private readonly dayCloses: IDayCloseRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(cmd: CloseDayCommand): Promise<CloseDayResult> {
    return this.dataSource.transaction(async (em) => {
      const closing = new DayClose();
      closing.closedBy = cmd.adminId;
      closing.closedAt = new Date();
      closing.note = cmd.note?.trim() || null;
      const saved = await this.dayCloses.save(closing, em);

      const orders = await this.orders.claimUnclosedTerminal(saved.id, em);
      const summary = buildDayCloseSummary(orders);
      saved.orderCount = summary.orderCount;
      saved.totalAmount = summary.totalAmount;
      saved.methodBreakdown = summary.byMethod;
      const final = await this.dayCloses.save(saved, em);
      return { ...summary, id: final.id, closedAt: final.closedAt, note: final.note };
    });
  }
}
```

(`saved.id` llega del primer save — el claim usa ese id como FK.
`cancelledCount`/`cancelledAmount` también se persisten en el
registro: el resumen es un snapshot del hecho, no se re-deriva.)

Agregar al cuerpo del `execute`, junto a los otros campos del
snapshot:
```typescript
      saved.cancelledCount = summary.cancelledCount;
      saved.cancelledAmount = summary.cancelledAmount;
```

## 18. orders.service.ts (archivo existente — actualización)

**Ruta:** `src/modules/orders/application/services/orders.service.ts`

**Antes:**
```typescript
  async listAdminTables(adminId: string): Promise<AdminTablesResponseDto> {
```

**Después:**
```typescript
  async previewDayClose(
    _adminId: string,
  ): Promise<DayClosePreviewResponseDto> {
    const summary = await this.previewDayCloseUseCase.execute();
    return this.ordersMapper.toDayClosePreviewResponse(summary);
  }

  async closeDay(
    adminId: string,
    dto: CloseDayDto,
  ): Promise<DayCloseResponseDto> {
    const result = await this.closeDayUseCase.execute({
      adminId,
      note: dto.note,
    });
    return this.ordersMapper.toDayCloseResponse(result);
  }

  async listAdminTables(adminId: string): Promise<AdminTablesResponseDto> {
```

(el `_adminId` del preview se conserva por simetría de la firma —
el guard ya valida rol; si el linter lo rechaza, quitar el parámetro.)

## 19. order.mapper.ts (archivo existente — actualización)

**Ruta:** `src/modules/orders/application/mappers/order.mapper.ts`

Agregar `toDayClosePreviewResponse(summary)` y
`toDayCloseResponse(result)` — mapeo directo campo a campo,
`closedAt` a ISO string (los use-cases no construyen DTOs — regla
estricta de capas).

## 20. orders.module.ts (archivo existente — actualización)

**Ruta:** `src/modules/orders/orders.module.ts`

- `TypeOrmModule.forFeature([... , DayCloseSchema])` (o el mecanismo
  de registro de schemas del proyecto)
- providers: `PreviewDayCloseUseCase`, `CloseDayUseCase`,
  `{ provide: DAY_CLOSE_REPOSITORY, useClass: DayCloseRepository }`
- imports de los nuevos archivos.

## 21-22. Docs (archivos nuevos + 2 actualizaciones)

- `documentacion/api/admin/006-get-admin-day-close.md` — preview:
  auth admin, 200 con `{orderCount,totalAmount,byMethod,orders}`,
  semántica "lo que cerraría ahora".
- `documentacion/api/admin/007-post-admin-day-close.md` — 201 con el
  snapshot + `id`/`closedAt`/`note` + campos `cancelledCount`/
  `cancelledAmount`, nota de que cierra `done` y estampa `cancelled`
  al periodo, los activos cruzan de día, y el cierre vacío devuelve
  un registro con ceros (bitácora — no hay 409).
- `001-get-admin-orders.md` — buckets nuevos (done-sin-cerrar vive en
  `active`, `history` = cerrados + cancelados).
- `002-patch-admin-orders-id-status.md` — matriz con `ready` y su
  label por canal.

## 23. Specs unitarios

- `update-order-status.use-case.spec.ts` — nueva matriz:
  `confirmed→preparing`, `preparing→ready`, `ready→done`,
  `confirmed→done` ahora 409, `preparing→done` ahora 409,
  `ready→done` sin pago → `PaymentNotSettled`.
- `close-day.use-case.spec.ts` (nuevo) — happy path (summary por
  método + cancelados contados), **cierre vacío → registro con
  ceros** (no hay 409), `note` trim, un `done` ya cerrado no entra
  dos veces.
- `preview-day-close.use-case.spec.ts` (nuevo) — summary vacío,
  agrupación por método, `payment` ausente → método `unknown`,
  cancelados contados aparte (no suman al total).

## 24. e2e

- `test/admin/day-close.e2e-spec.ts` (nuevo): seed 2 done (cash +
  transfer) + 1 confirmed + 1 cancelled → `GET day-close` preview
  (2 entregados + 1 cancelado de contexto) → `POST day-close` → el
  bucket `active` ya no lista los done, `history` sí; el confirmed
  sigue activo; el registro guarda `cancelledCount=1`; **segundo
  `POST` → 201 con ceros** (cierre vacío permitido). + Matriz:
  `confirmed→preparing→ready→done` completa y `confirmed→done`
  salta 409.
- Actualizar el e2e de transiciones admin si asume `confirmed→done`
  directo.

## 25. Pendientes — ninguno nuevo

La lista de cierres históricos se anota como "fuera de alcance"
(la tabla ya la soporta).

---

## Orden de aplicación recomendado

1. `admin-orders.controller.ts` (endpoints — referencian DTO/service)
2. `close-day.dto.ts` + `day-close.response.dto.ts`
3. `nothing-to-close.exception.ts`
4. `order-status.enum.ts` + matriz en `update-order-status.use-case.ts`
5. `order.entity.ts` (+`dayCloseId`) + `day-close.entity.ts`
6. `day-close.repository.interface.ts` + `order.repository.interface.ts`
7. `order.schema.ts` + `day-close.schema.ts` + migración
8. `order.repository.ts` + `day-close.repository.ts`
9. `preview-day-close.use-case.ts` + `close-day.use-case.ts`
10. `order.mapper.ts` + `orders.service.ts` + `orders.module.ts`
11. Docs
12. Specs + e2e

---

## Adición §037 — campos que el detalle admin aprobado exige

La pantalla Cocina/admin maduró en la app (§037 aprobada + commit
`083e5dc`). Esto se incorpora a esta misma propuesta para no abrir
una 023 — el contrato del kanban vive acá.

### A. `orders.status_changed_at` — la cola por carril

**Decisión del dueño (app §037):** cada carril del kanban ordena por
cuándo entró el pedido a ESE estado (recién movido cae al fondo), no
por `placed_at`. Reemplaza el FIFO global.

- **Migración**: `orders.status_changed_at timestamptz NULL` —
  backfill `= created_at` para filas existentes (todas siguen en su
  estado de nacimiento); `NOT NULL` después.
- **`update-order-status.use-case`**: cada transición válida estampa
  `statusChangedAt = now` junto al `status` (mismo UPDATE — el par
  viaja atómico). `create-order` lo siembra `= created_at`.
- **`OrderResponseDto`**: +`statusChangedAt: Date`.
- La app ordena el carril por este campo (o `placedAt` si el
  pedido nació en el estado — el backend ya lo resuelve igual:
  nacer = entrar).

### B. Desglose de dirección para domicilios

`orders.delivery_address` es texto libre; el detalle muestra
etiqueta/landmark/barrio separados. `orders.address_id` ya apunta a
`addresses` (label + landmark + neighborhood + lat/lng — la zona no
tiene nomenclatura formal, el landmark ES la dirección).

- **`AdminOrderResponseDto`**: +`deliveryAddressLabel`,
  +`deliveryLandmark`, +`deliveryNeighborhood` (nullable) — se
  resuelven desde la relación `address` cuando `addressId` existe;
  fallback a `deliveryAddress` crudo para pedidos sin addressId
  (tomados por teléfono sin ficha).
- Repository: `leftJoinAndSelect('order.address')` en el admin
  list/detail — mismo patrón anti-N+1 de la 019 (batch, no loop).

### C. Pin de Maps accionable

`orders.delivery_location_link` YA EXISTE — es el link compartido
(maps.app.goo.gl) que el cliente guardó al fijar el pin. El admin
response ya lo expone vía `deliveryLocationLink` — la app lo mapea
a `locationUrl` verbatim (decisión del dueño). Si llegara a faltar
para domicilios con pin, considerar `addresses.latitude/longitude`
como fuente para construir el link — evaluado en implementación
(modelo-evolucion si hace falta columna).

### D. `confirm-payment` cobra Y avanza

La matriz aprobada del dueño: "Registrar pago" certifica el cobro
manual **y avanza el estado en el mismo hecho** — no son dos
llamadas:

- `POST /admin/orders/:id/confirm-payment` además de marcar el pago
  `paid`, aplica la transición implícita: `received→confirmed`
  (presencial pickup — el cobro era la puerta) y `ready→done`
  (mesa cobrada al final / domicilio cobrado en la puerta).
  En otros estados solo registra el pago (delivery transfer en
  received — el dueño confirma aparte porque puede confirmar sin
  cobrar).
- Idempotente: si el pago ya está `paid` el endpoint es no-op 200.
- El `409 PaymentNotSettled` de la puerta (019) sigue igual —
  `confirm` directo sin pago para presencial+pickup y `ready→done`
  sin pago rechazan; el `confirm-payment` es el camino autorizado.

### E. Campos que YA están cubiertos — no toca

`contactPhone`, `notes`, `cancelReason`, `subtotal`, `deliveryFee`,
`total`, `channel`, `serviceType`, `orderNumber` (el correlativo
humano — la app muestra formato corto `#adm-N` aprobado, sin
`order_no` extra), `deliveryAddress`, `deliveryLocationLink`,
items con `includedNames` + `modifiers` (auto-expansión del
detalle) — todos ya viajan en `OrderResponseDto`/`AdminOrderResponseDto`.

### F. Tests a sumar

- `update-order-status` estampa `status_changed_at` en cada
  transición; backfill en migración deja los existentes
  `= created_at`.
- `confirm-payment`: received→confirmed (pickup presencial),
  ready→done, otros estados solo marcan paid, idempotencia.
- Admin list/detail expone `statusChangedAt` + desglose de
  dirección desde `addresses`.
