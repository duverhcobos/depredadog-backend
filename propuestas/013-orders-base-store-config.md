# Propuesta: Módulo orders — base de datos + `GET /store/config`

Primera piedra del módulo orders. Crea **todas** las tablas de
`store`/`orders`/`payments` (el modelo ya está aprobado en
`documentacion/modelo-de-datos.md`), las entidades/enums/schemas que las
mapean, y el primer endpoint del módulo store: `GET /store/config`, que la
app usa para el pill "Abierto" del header y para el checkout (fee,
mínimo de delivery, horario). Los endpoints de pedidos/pagos llegan en
propuestas 014+ — esta deja el suelo puesto.

Incluye también el cierre del **pendiente 008** (índices en las junctions
del catálogo) — corrección post-revisión: el PK compuesto ya servía
`product_id`; la migración llegó a crearse/aplicarse y se
revirtió+eliminó al detectar la redundancia. El pendiente quedó
resuelto **sin cambios** (ver sección 6).

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/store/domain/entities/store-settings.entity.ts` | nuevo |
| `src/modules/store/domain/entities/business-hour.entity.ts` | nuevo |
| `src/modules/store/domain/entities/store-table.entity.ts` | nuevo |
| `src/modules/store/domain/services/store-schedule.service.ts` | nuevo — lógica abierto/cerrado (cruza medianoche) |
| `src/modules/store/domain/repositories/store.repository.interface.ts` | nuevo |
| `src/modules/orders/domain/enums/order-channel.enum.ts` | nuevo |
| `src/modules/orders/domain/enums/order-service-type.enum.ts` | nuevo |
| `src/modules/orders/domain/enums/order-status.enum.ts` | nuevo |
| `src/modules/orders/domain/enums/modifier-action.enum.ts` | nuevo |
| `src/modules/orders/domain/entities/order.entity.ts` | nuevo |
| `src/modules/orders/domain/entities/order-item.entity.ts` | nuevo |
| `src/modules/orders/domain/entities/order-item-modifier.entity.ts` | nuevo |
| `src/modules/payments/domain/enums/payment-method.enum.ts` | nuevo |
| `src/modules/payments/domain/enums/payment-status.enum.ts` | nuevo |
| `src/modules/payments/domain/entities/payment.entity.ts` | nuevo |
| `src/infrastructure/database/schemas/store-settings.schema.ts` | nuevo |
| `src/infrastructure/database/schemas/business-hour.schema.ts` | nuevo |
| `src/infrastructure/database/schemas/store-table.schema.ts` | nuevo |
| `src/infrastructure/database/schemas/order.schema.ts` | nuevo |
| `src/infrastructure/database/schemas/order-item.schema.ts` | nuevo |
| `src/infrastructure/database/schemas/order-item-modifier.schema.ts` | nuevo |
| `src/infrastructure/database/schemas/payment.schema.ts` | nuevo |
| `src/infrastructure/database/migrations/<ts>-CreateOrdersModuleTables.ts` | nuevo — 6 enums + 7 tablas + índices |
| ~~`src/infrastructure/database/migrations/<ts>-AddCatalogJunctionIndexes.ts`~~ | ~~nuevo~~ **descartado post-revisión** — redundante (ver sección 6) |
| `src/config/store.config.ts` | nuevo — `STORE_TIMEZONE` |
| `src/config/env.validation.ts` | agregar `STORE_TIMEZONE` |
| `src/modules/store/application/dtos/store-config-response.dto.ts` | nuevo |
| `src/modules/store/application/mappers/store.mapper.ts` | nuevo |
| `src/modules/store/application/use-cases/get-store-config.use-case.ts` | nuevo |
| `src/modules/store/application/services/store.service.ts` | nuevo |
| `src/modules/store/infrastructure/repositories/store.repository.ts` | nuevo |
| `src/modules/store/presentation/controllers/store.controller.ts` | nuevo |
| `src/modules/store/store.module.ts` | nuevo |
| `src/app.module.ts` | registrar `StoreModule` + `storeConfig` |
| `src/infrastructure/database/seeds/store.seed.ts` | nuevo — settings + horario + mesas |
| `package.json` | script `seed:store` |
| `.env.example` | `STORE_TIMEZONE` documentado |
| `documentacion/api/store/001-get-store-config.md` | nuevo |
| `documentacion/api/README.md` | fila del endpoint |
| `documentacion/modelo-de-datos.md` | `orders`: índice consecutivo → `order_date` implementado |
| `pendientes/008-indices-junction-catalogo.md` | marcar resuelto |
| `pendientes/010-nequi-conecta-onboarding.md` | nuevo — dependencia externa |
| Tests | `store-schedule.service.spec.ts`, `get-store-config.use-case.spec.ts`, `store.service.spec.ts`, `test/store/store-config.e2e-spec.ts` |

---

## Parte A — persistencia del módulo

### 1. Enums de dominio (archivos nuevos)

**Ruta:** `src/modules/orders/domain/enums/order-channel.enum.ts`

```typescript
export enum OrderChannel {
  ONLINE = 'online',
  PRESENCIAL = 'presencial',
}
```

**Ruta:** `src/modules/orders/domain/enums/order-service-type.enum.ts`

```typescript
export enum OrderServiceType {
  PICKUP = 'pickup',
  DELIVERY = 'delivery',
  DINE_IN = 'dine_in',
}
```

**Ruta:** `src/modules/orders/domain/enums/order-status.enum.ts`

```typescript
export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  DONE = 'done',
  CANCELLED = 'cancelled',
}
```

**Ruta:** `src/modules/orders/domain/enums/modifier-action.enum.ts`

```typescript
export enum ModifierAction {
  ADDED = 'added',
  REMOVED = 'removed',
}
```

**Ruta:** `src/modules/payments/domain/enums/payment-method.enum.ts`

```typescript
export enum PaymentMethod {
  CASH = 'cash',
  TRANSFER = 'transfer',
  GATEWAY = 'gateway',
}
```

**Ruta:** `src/modules/payments/domain/enums/payment-status.enum.ts`

```typescript
export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}
```

### 2. Entidades de dominio (archivos nuevos)

**Ruta:** `src/modules/store/domain/entities/store-settings.entity.ts`

```typescript
// Una sola fila — configuración global del negocio (single-tenant).
export class StoreSettings {
  id!: string;
  name!: string;
  phone: string | null = null;
  address: string | null = null;
  logoUrl: string | null = null;
  deliveryFee = 0;
  minDeliveryOrder: number | null = null;
  createdAt!: Date;
  updatedAt!: Date;
}
```

**Ruta:** `src/modules/store/domain/entities/business-hour.entity.ts`

```typescript
export class BusinessHour {
  id!: string;
  /** 0=domingo … 6=sábado (convención JS getDay / PG extract(dow)). */
  dayOfWeek!: number;
  /** 'HH:MM:SS' — hora local del negocio (time de PG llega como string). */
  opensAt!: string;
  closesAt!: string;
  isClosed = false;
}
```

**Ruta:** `src/modules/store/domain/entities/store-table.entity.ts`

```typescript
// Mesa del local — el pedido presencial (dine_in) la referencia.
export class StoreTable {
  id!: string;
  label!: string;
  isActive = true;
  createdAt!: Date;
}
```

**Ruta:** `src/modules/orders/domain/entities/order.entity.ts`

```typescript
import { OrderChannel } from '../enums/order-channel.enum';
import { OrderServiceType } from '../enums/order-service-type.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderItem } from './order-item.entity';

export class Order {
  id!: string;
  /** Día de negocio en la tz del local ('YYYY-MM-DD') — reset diario
   * del consecutivo con UNIQUE(order_date, order_number). */
  orderDate!: string;
  orderNumber!: number;
  channel!: OrderChannel;
  serviceType!: OrderServiceType;
  customerId: string | null = null;
  takenBy: string | null = null;
  tableId: string | null = null;
  addressId: string | null = null;
  deliveryAddress: string | null = null;
  status: OrderStatus = OrderStatus.PENDING;
  subtotal!: number;
  deliveryFee = 0;
  discount = 0;
  total!: number;
  notes: string | null = null;
  cancelReason: string | null = null;
  /** Cargados por el repositorio cuando el use-case los pide. */
  items: OrderItem[] = [];
  createdAt!: Date;
  updatedAt!: Date;
}
```

**Ruta:** `src/modules/orders/domain/entities/order-item.entity.ts`

```typescript
import { OrderItemModifier } from './order-item-modifier.entity';

export class OrderItem {
  id!: string;
  orderId!: string;
  productId!: string;
  /** Snapshots — el producto puede renombrarse o cambiar de precio. */
  productName!: string;
  unitPrice!: number;
  quantity!: number;
  lineTotal!: number;
  notes: string | null = null;
  modifiers: OrderItemModifier[] = [];
}
```

**Ruta:** `src/modules/orders/domain/entities/order-item-modifier.entity.ts`

```typescript
import { ModifierAction } from '../enums/modifier-action.enum';

export class OrderItemModifier {
  id!: string;
  orderItemId!: string;
  /** NULL si la opción se borra del catálogo — el snapshot queda. */
  optionId: string | null = null;
  optionName!: string;
  action!: ModifierAction;
  priceDelta = 0;
}
```

**Ruta:** `src/modules/payments/domain/entities/payment.entity.ts`

```typescript
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';

export class Payment {
  id!: string;
  orderId!: string;
  method!: PaymentMethod;
  status: PaymentStatus = PaymentStatus.PENDING;
  amount!: number;
  provider: string | null = null;
  providerReference: string | null = null;
  /** Respuesta cruda del proveedor/webhook — auditoría. */
  providerPayload: Record<string, unknown> | null = null;
  evidenceUrl: string | null = null;
  confirmedBy: string | null = null;
  confirmedAt: Date | null = null;
  refundedAt: Date | null = null;
  refundReason: string | null = null;
  createdAt!: Date;
  updatedAt!: Date;
}
```

### 3. Servicio de dominio — horario del negocio (archivo nuevo)

`is_open` no se guarda: se **deriva** de `business_hours` + la hora actual
en la timezone del local. `closes_at <= opens_at` = rango que cruza
medianoche (17:00→02:00). Soporta el caso "abierto por el rango de ayer".

**Ruta:** `src/modules/store/domain/services/store-schedule.service.ts`

```typescript
import { BusinessHour } from '../entities/business-hour.entity';

interface ZonedMoment {
  dayOfWeek: number;
  minutes: number; // minutos desde 00:00 del día de negocio
}

// Lógica pura de horario — sin dependencias, testeable al 100%.
export class StoreSchedule {
  /** Hora de pared del local en su timezone (sin librerías: Intl/Date). */
  static zonedNow(now: Date, timeZone: string): ZonedMoment {
    const zoned = new Date(
      now.toLocaleString('en-US', { timeZone }),
    );
    return {
      dayOfWeek: zoned.getDay(),
      minutes: zoned.getHours() * 60 + zoned.getMinutes(),
    };
  }

  private static toMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  /** La fila que gobierna este instante: la de hoy, o la de ayer si su
   * rango cruza medianoche y aún no ha cerrado. null = cerrado. */
  static governingPeriod(
    hours: BusinessHour[],
    now: Date,
    timeZone: string,
  ): BusinessHour | null {
    const { dayOfWeek, minutes } = StoreSchedule.zonedNow(now, timeZone);
    const byDay = new Map(hours.map((h) => [h.dayOfWeek, h]));
    const today = byDay.get(dayOfWeek);
    const yesterday = byDay.get((dayOfWeek + 6) % 7);

    if (today && !today.isClosed) {
      const opens = StoreSchedule.toMinutes(today.opensAt);
      const closes = StoreSchedule.toMinutes(today.closesAt);
      const crosses = closes <= opens;
      if (crosses ? minutes >= opens : minutes >= opens && minutes < closes) {
        return today;
      }
    }
    if (yesterday && !yesterday.isClosed) {
      const opens = StoreSchedule.toMinutes(yesterday.opensAt);
      const closes = StoreSchedule.toMinutes(yesterday.closesAt);
      if (closes <= opens && minutes < closes) {
        return yesterday;
      }
    }
    return null;
  }

  static isOpenNow(
    hours: BusinessHour[],
    now: Date,
    timeZone: string,
  ): boolean {
    return StoreSchedule.governingPeriod(hours, now, timeZone) !== null;
  }

  /** La fila del día de hoy (para mostrar "hoy abre/cierra a las X"). */
  static today(
    hours: BusinessHour[],
    now: Date,
    timeZone: string,
  ): BusinessHour | null {
    const { dayOfWeek } = StoreSchedule.zonedNow(now, timeZone);
    return hours.find((h) => h.dayOfWeek === dayOfWeek) ?? null;
  }
}
```

### 4. Schemas TypeORM (archivos nuevos)

**Ruta:** `src/infrastructure/database/schemas/store-settings.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { StoreSettings } from '../../../modules/store/domain/entities/store-settings.entity';

const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const StoreSettingsSchema = new EntitySchema<StoreSettings>({
  name: 'StoreSettings',
  target: StoreSettings,
  tableName: 'store_settings',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    name: { type: 'varchar', length: 150 },
    phone: { type: 'varchar', length: 20, nullable: true },
    address: { type: 'varchar', length: 255, nullable: true },
    logoUrl: { name: 'logo_url', type: 'varchar', length: 500, nullable: true },
    deliveryFee: {
      name: 'delivery_fee',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
      default: 0,
    },
    minDeliveryOrder: {
      name: 'min_delivery_order',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
      nullable: true,
    },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
```

**Ruta:** `src/infrastructure/database/schemas/business-hour.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { BusinessHour } from '../../../modules/store/domain/entities/business-hour.entity';

export const BusinessHourSchema = new EntitySchema<BusinessHour>({
  name: 'BusinessHour',
  target: BusinessHour,
  tableName: 'business_hours',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    dayOfWeek: { name: 'day_of_week', type: 'smallint' },
    opensAt: { name: 'opens_at', type: 'time' },
    closesAt: { name: 'closes_at', type: 'time' },
    isClosed: { name: 'is_closed', type: 'boolean', default: false },
  },
});
```

**Ruta:** `src/infrastructure/database/schemas/store-table.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { StoreTable } from '../../../modules/store/domain/entities/store-table.entity';

export const StoreTableSchema = new EntitySchema<StoreTable>({
  name: 'StoreTable',
  target: StoreTable,
  tableName: 'tables',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    label: { type: 'varchar', length: 20 },
    isActive: { name: 'is_active', type: 'boolean', default: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
  },
});
```

**Ruta:** `src/infrastructure/database/schemas/order.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { Order } from '../../../modules/orders/domain/entities/order.entity';
import { OrderChannel } from '../../../modules/orders/domain/enums/order-channel.enum';
import { OrderServiceType } from '../../../modules/orders/domain/enums/order-service-type.enum';
import { OrderStatus } from '../../../modules/orders/domain/enums/order-status.enum';

const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const OrderSchema = new EntitySchema<Order>({
  name: 'Order',
  target: Order,
  tableName: 'orders',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    orderDate: { name: 'order_date', type: 'date' },
    orderNumber: { name: 'order_number', type: 'int' },
    channel: { type: 'enum', enum: OrderChannel, enumName: 'order_channel' },
    serviceType: {
      name: 'service_type',
      type: 'enum',
      enum: OrderServiceType,
      enumName: 'order_service_type',
    },
    customerId: { name: 'customer_id', type: 'uuid', nullable: true },
    takenBy: { name: 'taken_by', type: 'uuid', nullable: true },
    tableId: { name: 'table_id', type: 'uuid', nullable: true },
    addressId: { name: 'address_id', type: 'uuid', nullable: true },
    deliveryAddress: {
      name: 'delivery_address',
      type: 'text',
      nullable: true,
    },
    status: {
      type: 'enum',
      enum: OrderStatus,
      enumName: 'order_status',
      default: OrderStatus.PENDING,
    },
    subtotal: {
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
    },
    deliveryFee: {
      name: 'delivery_fee',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
      default: 0,
    },
    discount: {
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
      default: 0,
    },
    total: {
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
    },
    notes: { type: 'text', nullable: true },
    cancelReason: { name: 'cancel_reason', type: 'text', nullable: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
```

**Ruta:** `src/infrastructure/database/schemas/order-item.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { OrderItem } from '../../../modules/orders/domain/entities/order-item.entity';

const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const OrderItemSchema = new EntitySchema<OrderItem>({
  name: 'OrderItem',
  target: OrderItem,
  tableName: 'order_items',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    orderId: { name: 'order_id', type: 'uuid' },
    productId: { name: 'product_id', type: 'uuid' },
    productName: { name: 'product_name', type: 'varchar', length: 150 },
    unitPrice: {
      name: 'unit_price',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
    },
    quantity: { type: 'int' },
    lineTotal: {
      name: 'line_total',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
    },
    notes: { type: 'text', nullable: true },
  },
});
```

**Ruta:** `src/infrastructure/database/schemas/order-item-modifier.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { OrderItemModifier } from '../../../modules/orders/domain/entities/order-item-modifier.entity';
import { ModifierAction } from '../../../modules/orders/domain/enums/modifier-action.enum';

const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const OrderItemModifierSchema = new EntitySchema<OrderItemModifier>({
  name: 'OrderItemModifier',
  target: OrderItemModifier,
  tableName: 'order_item_modifiers',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    orderItemId: { name: 'order_item_id', type: 'uuid' },
    optionId: { name: 'option_id', type: 'uuid', nullable: true },
    optionName: { name: 'option_name', type: 'varchar', length: 100 },
    action: {
      type: 'enum',
      enum: ModifierAction,
      enumName: 'modifier_action',
    },
    priceDelta: {
      name: 'price_delta',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
      default: 0,
    },
  },
});
```

**Ruta:** `src/infrastructure/database/schemas/payment.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { Payment } from '../../../modules/payments/domain/entities/payment.entity';
import { PaymentMethod } from '../../../modules/payments/domain/enums/payment-method.enum';
import { PaymentStatus } from '../../../modules/payments/domain/enums/payment-status.enum';

const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const PaymentSchema = new EntitySchema<Payment>({
  name: 'Payment',
  target: Payment,
  tableName: 'payments',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    orderId: { name: 'order_id', type: 'uuid' },
    method: { type: 'enum', enum: PaymentMethod, enumName: 'payment_method' },
    status: {
      type: 'enum',
      enum: PaymentStatus,
      enumName: 'payment_status',
      default: PaymentStatus.PENDING,
    },
    amount: {
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
    },
    provider: { type: 'varchar', length: 50, nullable: true },
    providerReference: {
      name: 'provider_reference',
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    providerPayload: { name: 'provider_payload', type: 'jsonb', nullable: true },
    evidenceUrl: {
      name: 'evidence_url',
      type: 'varchar',
      length: 500,
      nullable: true,
    },
    confirmedBy: { name: 'confirmed_by', type: 'uuid', nullable: true },
    confirmedAt: { name: 'confirmed_at', type: 'timestamptz', nullable: true },
    refundedAt: { name: 'refunded_at', type: 'timestamptz', nullable: true },
    refundReason: { name: 'refund_reason', type: 'text', nullable: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
```

### 5. Migración — tablas del módulo (archivo nuevo)

Generar el archivo con `npm run migration:create` (el timestamp lo pone
el comando). `day_of_week`: **0=domingo** — misma convención que JS
`getDay()` y PG `extract(dow)`. `order_date` es el día de negocio en la
tz del local: la calcula la aplicación al crear el pedido (propuesta de
orders) — permite el reset diario del `order_number` con
`UNIQUE(order_date, order_number)`.

**Ruta:** `src/infrastructure/database/migrations/<timestamp>-CreateOrdersModuleTables.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrdersModuleTables<timestamp> implements MigrationInterface {
  name = 'CreateOrdersModuleTables<timestamp>';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "order_channel" AS ENUM ('online', 'presencial')`,
    );
    await queryRunner.query(
      `CREATE TYPE "order_service_type" AS ENUM ('pickup', 'delivery', 'dine_in')`,
    );
    await queryRunner.query(
      `CREATE TYPE "order_status" AS ENUM ('pending', 'confirmed', 'preparing', 'done', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "payment_method" AS ENUM ('cash', 'transfer', 'gateway')`,
    );
    await queryRunner.query(
      `CREATE TYPE "payment_status" AS ENUM ('pending', 'paid', 'failed', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TYPE "modifier_action" AS ENUM ('added', 'removed')`,
    );

    // Una sola fila — config global del negocio (single-tenant).
    await queryRunner.query(`
      CREATE TABLE "store_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(150) NOT NULL,
        "phone" varchar(20),
        "address" varchar(255),
        "logo_url" varchar(500),
        "delivery_fee" numeric(10,2) NOT NULL DEFAULT 0,
        "min_delivery_order" numeric(10,2),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Un rango por día (0=domingo…6=sábado). is_closed=true concentra el
    // "no abre" — opens_at/closes_at quedan NOT NULL con valor centinela.
    await queryRunner.query(`
      CREATE TABLE "business_hours" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "day_of_week" smallint NOT NULL,
        "opens_at" time NOT NULL,
        "closes_at" time NOT NULL,
        "is_closed" boolean NOT NULL DEFAULT false,
        CONSTRAINT "uq_business_hours_day" UNIQUE ("day_of_week"),
        CONSTRAINT "chk_business_hours_dow" CHECK ("day_of_week" BETWEEN 0 AND 6)
      )
    `);

    // Mesas mínimas — el pedido presencial (dine_in) las referencia.
    await queryRunner.query(`
      CREATE TABLE "tables" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "label" varchar(20) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_tables_label" UNIQUE ("label")
      )
    `);

    // order_date = día de negocio en la tz del local (lo escribe la app
    // de backend al crear el pedido) → reset diario del consecutivo.
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_date" date NOT NULL,
        "order_number" int NOT NULL,
        "channel" order_channel NOT NULL,
        "service_type" order_service_type NOT NULL,
        "customer_id" uuid REFERENCES "users"("id"),
        "taken_by" uuid REFERENCES "users"("id"),
        "table_id" uuid REFERENCES "tables"("id"),
        "address_id" uuid REFERENCES "addresses"("id"),
        "delivery_address" text,
        "status" order_status NOT NULL DEFAULT 'pending',
        "subtotal" numeric(10,2) NOT NULL,
        "delivery_fee" numeric(10,2) NOT NULL DEFAULT 0,
        "discount" numeric(10,2) NOT NULL DEFAULT 0,
        "total" numeric(10,2) NOT NULL,
        "notes" text,
        "cancel_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_orders_day_number" UNIQUE ("order_date", "order_number")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_orders_status_created" ON "orders" ("status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_orders_customer_created" ON "orders" ("customer_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_orders_table_open" ON "orders" ("table_id") WHERE "status" NOT IN ('done','cancelled')`,
    );

    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "product_id" uuid NOT NULL REFERENCES "products"("id"),
        "product_name" varchar(150) NOT NULL,
        "unit_price" numeric(10,2) NOT NULL,
        "quantity" int NOT NULL,
        "line_total" numeric(10,2) NOT NULL,
        "notes" text
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_order_items_order" ON "order_items" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_order_items_product" ON "order_items" ("product_id")`,
    );

    // option_id nullable: la fila sobrevive si la opción se borra del
    // catálogo — el snapshot (option_name, price_delta) basta al reporte.
    await queryRunner.query(`
      CREATE TABLE "order_item_modifiers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_item_id" uuid NOT NULL REFERENCES "order_items"("id") ON DELETE CASCADE,
        "option_id" uuid REFERENCES "modifier_options"("id"),
        "option_name" varchar(100) NOT NULL,
        "action" modifier_action NOT NULL,
        "price_delta" numeric(10,2) NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_oim_item" ON "order_item_modifiers" ("order_item_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_oim_option" ON "order_item_modifiers" ("option_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL REFERENCES "orders"("id"),
        "method" payment_method NOT NULL,
        "status" payment_status NOT NULL DEFAULT 'pending',
        "amount" numeric(10,2) NOT NULL,
        "provider" varchar(50),
        "provider_reference" varchar(255),
        "provider_payload" jsonb,
        "evidence_url" varchar(500),
        "confirmed_by" uuid REFERENCES "users"("id"),
        "confirmed_at" timestamptz,
        "refunded_at" timestamptz,
        "refund_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_payments_order" ON "payments" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payments_status_created" ON "payments" ("status", "created_at")`,
    );
    // Un solo pago "vivo" por orden — reintentos dejan la fila anterior
    // en failed/cancelled antes de crear la nueva.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_payments_one_live" ON "payments" ("order_id") WHERE "status" IN ('pending','paid')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TABLE "order_item_modifiers"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TABLE "tables"`);
    await queryRunner.query(`DROP TABLE "business_hours"`);
    await queryRunner.query(`DROP TABLE "store_settings"`);
    await queryRunner.query(`DROP TYPE "modifier_action"`);
    await queryRunner.query(`DROP TYPE "payment_status"`);
    await queryRunner.query(`DROP TYPE "payment_method"`);
    await queryRunner.query(`DROP TYPE "order_status"`);
    await queryRunner.query(`DROP TYPE "order_service_type"`);
    await queryRunner.query(`DROP TYPE "order_channel"`);
  }
}
```

### 6. ~~Migración — índices junction catálogo~~ — DESCARTADA post-revisión

> **Corrección documentada:** esta migración se creó
> (`1793915862572-AddCatalogJunctionIndexes`), se aplicó en dev y test,
> y en la revisión posterior se detectó que la premisa del pendiente 008
> era errónea — `PRIMARY KEY (product_id, …)` ya sirve
> `WHERE product_id IN (...)` por prefijo izquierdo. Se revirtió en
> ambas BDs (`down()` verificado) y el archivo se eliminó **antes del
> commit**. `EXPLAIN` en test confirma index scan vía pkey. El
> pendiente 008 quedó resuelto **sin cambios en el esquema**.

---

## Parte B — `GET /store/config`

### 7. Config de la timezone del negocio (archivos nuevos/actualización)

**Ruta:** `src/config/store.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

// Zona horaria del negocio — define "abierto ahora" y el order_date
// de cada pedido. Colombia: America/Bogota.
export default registerAs('store', () => ({
  timezone: process.env.STORE_TIMEZONE || 'America/Bogota',
}));
```

**Ruta:** `src/config/env.validation.ts` (actualización)

**Antes:**
```typescript
  @IsOptional()
  @IsString()
  LOG_MAX_SIZE?: string;
}
```

**Después:**
```typescript
  @IsOptional()
  @IsString()
  LOG_MAX_SIZE?: string;

  @IsOptional()
  @IsString()
  STORE_TIMEZONE?: string;
}
```

**Ruta:** `.env.example` (actualización — agregar al final)

```
# Store — timezone del negocio para horario de atención y consecutivo
# de pedidos (IANA). Default: America/Bogota.
# STORE_TIMEZONE=America/Bogota
```

Agregar `STORE_TIMEZONE=America/Bogota` a `.env` y `.env.test`.

### 8. Repositorio — interface + implementación

**Ruta:** `src/modules/store/domain/repositories/store.repository.interface.ts`

```typescript
import { BusinessHour } from '../entities/business-hour.entity';
import { StoreSettings } from '../entities/store-settings.entity';

export interface IStoreRepository {
  /** La única fila de configuración. null = negocio sin configurar. */
  getSettings(): Promise<StoreSettings | null>;
  /** Los 7 días ordenados por day_of_week. */
  getBusinessHours(): Promise<BusinessHour[]>;
}

export const STORE_REPOSITORY = Symbol('IStoreRepository');
```

**Ruta:** `src/modules/store/infrastructure/repositories/store.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessHour } from '../../domain/entities/business-hour.entity';
import { StoreSettings } from '../../domain/entities/store-settings.entity';
import { IStoreRepository } from '../../domain/repositories/store.repository.interface';

@Injectable()
export class StoreRepository implements IStoreRepository {
  constructor(
    @InjectRepository(StoreSettings)
    private readonly settings: Repository<StoreSettings>,
    @InjectRepository(BusinessHour)
    private readonly hours: Repository<BusinessHour>,
  ) {}

  // Una sola fila por diseño — take(1) defensivo por si algún día hay más.
  async getSettings(): Promise<StoreSettings | null> {
    const rows = await this.settings.find({ take: 1 });
    return rows[0] ?? null;
  }

  getBusinessHours(): Promise<BusinessHour[]> {
    return this.hours.find({ order: { dayOfWeek: 'ASC' } });
  }
}
```

### 9. DTO + mapper

**Ruta:** `src/modules/store/application/dtos/store-config-response.dto.ts`

```typescript
export class DayHoursResponseDto {
  dayOfWeek!: number;
  /** 'HH:MM' hora local del negocio. */
  opensAt!: string;
  closesAt!: string;
  isClosed!: boolean;
}

export class StoreConfigResponseDto {
  name!: string;
  phone!: string | null;
  address!: string | null;
  logoUrl!: string | null;
  deliveryFee!: number;
  minDeliveryOrder!: number | null;
  /** Derivado de business_hours + STORE_TIMEZONE — nunca un flag manual. */
  isOpen!: boolean;
  /** La fila de hoy (para "Hoy cierra 23:00"). null si falta el día. */
  today!: DayHoursResponseDto | null;
  weeklyHours!: DayHoursResponseDto[];
}
```

**Ruta:** `src/modules/store/application/mappers/store.mapper.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { BusinessHour } from '../../domain/entities/business-hour.entity';
import { StoreSettings } from '../../domain/entities/store-settings.entity';
import {
  DayHoursResponseDto,
  StoreConfigResponseDto,
} from '../dtos/store-config-response.dto';

@Injectable()
export class StoreMapper {
  toConfigResponse(
    settings: StoreSettings,
    hours: BusinessHour[],
    isOpen: boolean,
    today: BusinessHour | null,
  ): StoreConfigResponseDto {
    const dto = new StoreConfigResponseDto();
    dto.name = settings.name;
    dto.phone = settings.phone;
    dto.address = settings.address;
    dto.logoUrl = settings.logoUrl;
    dto.deliveryFee = settings.deliveryFee;
    dto.minDeliveryOrder = settings.minDeliveryOrder;
    dto.isOpen = isOpen;
    dto.today = today ? this.toDayHours(today) : null;
    dto.weeklyHours = hours.map((h) => this.toDayHours(h));
    return dto;
  }

  private toDayHours(h: BusinessHour): DayHoursResponseDto {
    const dto = new DayHoursResponseDto();
    dto.dayOfWeek = h.dayOfWeek;
    // PG time llega 'HH:MM:SS' — el contrato expone 'HH:MM'.
    dto.opensAt = h.opensAt.slice(0, 5);
    dto.closesAt = h.closesAt.slice(0, 5);
    dto.isClosed = h.isClosed;
    return dto;
  }
}
```

### 10. Use-case + servicio

**Ruta:** `src/modules/store/application/use-cases/get-store-config.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { BusinessHour } from '../../domain/entities/business-hour.entity';
import { StoreSettings } from '../../domain/entities/store-settings.entity';
import {
  type IStoreRepository,
  STORE_REPOSITORY,
} from '../../domain/repositories/store.repository.interface';

export interface StoreConfigResult {
  settings: StoreSettings | null;
  hours: BusinessHour[];
}

@Injectable()
export class GetStoreConfigUseCase {
  constructor(
    @Inject(STORE_REPOSITORY)
    private readonly store: IStoreRepository,
  ) {}

  execute(): Promise<StoreConfigResult> {
    return Promise.all([
      this.store.getSettings(),
      this.store.getBusinessHours(),
    ]).then(([settings, hours]) => ({ settings, hours }));
  }
}
```

**Ruta:** `src/modules/store/application/services/store.service.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType, HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import storeConfig from '../../../../config/store.config';
import { StoreSchedule } from '../../domain/services/store-schedule.service';
import { StoreConfigResponseDto } from '../dtos/store-config-response.dto';
import { StoreMapper } from '../mappers/store.mapper';
import { GetStoreConfigUseCase } from '../use-cases/get-store-config.use-case';

@Injectable()
export class StoreService {
  constructor(
    private readonly getStoreConfig: GetStoreConfigUseCase,
    private readonly storeMapper: StoreMapper,
    @Inject(storeConfig.KEY)
    private readonly config: ConfigType<typeof storeConfig>,
  ) {}

  async getConfig(): Promise<StoreConfigResponseDto> {
    const { settings, hours } = await this.getStoreConfig.execute();
    if (!settings) {
      // Sin fila de settings el negocio no está configurado — fallo de
      // despliegue, no del cliente → 404 explícito (la app muestra su
      // estado de error; nunca un "abierto" falso).
      throw new DomainException(
        'store_not_configured',
        'La tienda no está configurada',
        HttpStatus.NOT_FOUND,
      );
    }
    const now = new Date();
    const isOpen = StoreSchedule.isOpenNow(hours, now, this.config.timezone);
    const today = StoreSchedule.today(hours, now, this.config.timezone);
    return this.storeMapper.toConfigResponse(settings, hours, isOpen, today);
  }
}
```

*(Verificar la firma exacta de `DomainException` en
`src/common/exceptions/domain.exception.ts` y el patrón que usa auth —
ajustar argumentos si difieren.)*

### 11. Controller + módulo

**Ruta:** `src/modules/store/presentation/controllers/store.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common';
import { StoreService } from '../../application/services/store.service';
import { StoreConfigResponseDto } from '../../application/dtos/store-config-response.dto';

@Controller('store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  // JWT global (igual que /catalog — la app lo consume logueada). Sin
  // @Throttle propio: lectura de navegación, el default global sobra.
  @Get('config')
  getConfig(): Promise<StoreConfigResponseDto> {
    return this.storeService.getConfig();
  }
}
```

**Ruta:** `src/modules/store/store.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessHourSchema } from '../../infrastructure/database/schemas/business-hour.schema';
import { StoreSettingsSchema } from '../../infrastructure/database/schemas/store-settings.schema';
import { StoreTableSchema } from '../../infrastructure/database/schemas/store-table.schema';
import { StoreController } from './presentation/controllers/store.controller';
import { StoreService } from './application/services/store.service';
import { StoreMapper } from './application/mappers/store.mapper';
import { GetStoreConfigUseCase } from './application/use-cases/get-store-config.use-case';
import { STORE_REPOSITORY } from './domain/repositories/store.repository.interface';
import { StoreRepository } from './infrastructure/repositories/store.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StoreSettingsSchema,
      BusinessHourSchema,
      StoreTableSchema,
    ]),
  ],
  controllers: [StoreController],
  providers: [
    StoreService,
    StoreMapper,
    GetStoreConfigUseCase,
    { provide: STORE_REPOSITORY, useClass: StoreRepository },
  ],
})
export class StoreModule {}
```

**Ruta:** `src/app.module.ts` (actualización)

**Antes:**
```typescript
import loggerConfig from './config/logger.config';
import throttleConfig from './config/throttle.config';
import { validate } from './config/env.validation';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
```

**Después:**
```typescript
import loggerConfig from './config/logger.config';
import storeConfig from './config/store.config';
import throttleConfig from './config/throttle.config';
import { validate } from './config/env.validation';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { StoreModule } from './modules/store/store.module';
```

**Antes:**
```typescript
      load: [
        appConfig,
        authConfig,
        databaseConfig,
        emailConfig,
        throttleConfig,
        loggerConfig,
      ],
```

**Después:**
```typescript
      load: [
        appConfig,
        authConfig,
        databaseConfig,
        emailConfig,
        throttleConfig,
        loggerConfig,
        storeConfig,
      ],
```

**Antes:**
```typescript
    AuthModule,
    CatalogModule,
  ],
```

**Después:**
```typescript
    AuthModule,
    CatalogModule,
    StoreModule,
  ],
```

### 12. Seed de desarrollo (archivo nuevo)

**Ruta:** `src/infrastructure/database/seeds/store.seed.ts`

Idempotente (UPSERT por PK/`day_of_week`/`label`) — mismos UUIDs fijos
que el seed de catálogo para evitar choques. **Valores placeholder** —
el dueño los ajusta cuando exista el panel admin.

```typescript
import dataSource from '../../../../typeorm.config';

// Seed de desarrollo de la tienda — idempotente.
// Uso: npm run seed:store
// VALORES PLACEHOLDER: el dueño configura horario/fee reales desde el
// panel admin (módulo futuro). 0=domingo … 6=sábado.

const SETTINGS_ID = '5e11c000-0000-4000-8000-000000000001';
const bh = (n: number): string =>
  `5e11c000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const tb = (n: number): string =>
  `5e11d000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

interface HourSeed {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

// Placeholder: lunes cerrado; mar-sáb 17:00–23:00; dom 16:00–23:00.
// Día cerrado: horas centinela '00:00' (ignoradas por is_closed).
const hours: HourSeed[] = [
  { dayOfWeek: 0, opensAt: '16:00', closesAt: '23:00', isClosed: false },
  { dayOfWeek: 1, opensAt: '00:00', closesAt: '00:00', isClosed: true },
  { dayOfWeek: 2, opensAt: '17:00', closesAt: '23:00', isClosed: false },
  { dayOfWeek: 3, opensAt: '17:00', closesAt: '23:00', isClosed: false },
  { dayOfWeek: 4, opensAt: '17:00', closesAt: '23:00', isClosed: false },
  { dayOfWeek: 5, opensAt: '17:00', closesAt: '23:00', isClosed: false },
  { dayOfWeek: 6, opensAt: '17:00', closesAt: '23:00', isClosed: false },
];

const tables = ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4'];

async function seed(): Promise<void> {
  await dataSource.initialize();
  const qr = dataSource.createQueryRunner();
  try {
    await qr.query(
      `INSERT INTO "store_settings"
        ("id", "name", "phone", "address", "delivery_fee", "min_delivery_order")
       VALUES ($1, 'Depredadog', NULL, $2, 2000, 10000)
       ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name",
        "address" = EXCLUDED."address",
        "delivery_fee" = EXCLUDED."delivery_fee",
        "min_delivery_order" = EXCLUDED."min_delivery_order"`,
      [SETTINGS_ID, 'Cl. 7ª, Pueblo Nuevo, Arauquita, Arauca'],
    );

    for (const [i, h] of hours.entries()) {
      await qr.query(
        `INSERT INTO "business_hours"
          ("id", "day_of_week", "opens_at", "closes_at", "is_closed")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("day_of_week") DO UPDATE SET
          "opens_at" = EXCLUDED."opens_at",
          "closes_at" = EXCLUDED."closes_at",
          "is_closed" = EXCLUDED."is_closed"`,
        [bh(i + 1), h.dayOfWeek, h.opensAt, h.closesAt, h.isClosed],
      );
    }

    for (const [i, label] of tables.entries()) {
      await qr.query(
        `INSERT INTO "tables" ("id", "label") VALUES ($1, $2)
         ON CONFLICT ("label") DO NOTHING`,
        [tb(i + 1), label],
      );
    }

    const [{ c: settings }] = await qr.query(
      `SELECT count(*)::int AS c FROM "store_settings"`,
    );
    const [{ c: hcount }] = await qr.query(
      `SELECT count(*)::int AS c FROM "business_hours"`,
    );
    const [{ c: tcount }] = await qr.query(
      `SELECT count(*)::int AS c FROM "tables"`,
    );
    console.log(
      `store seed OK — settings:${settings} horas:${hcount} mesas:${tcount}`,
    );
  } finally {
    await qr.release();
    await dataSource.destroy();
  }
}

seed().catch((e) => {
  console.error('store seed failed', e);
  process.exit(1);
});
```

**Ruta:** `package.json` (actualización)

**Antes:**
```json
    "seed:catalog": "ts-node src/infrastructure/database/seeds/catalog.seed.ts"
```

**Después:**
```json
    "seed:catalog": "ts-node src/infrastructure/database/seeds/catalog.seed.ts",
    "seed:store": "ts-node src/infrastructure/database/seeds/store.seed.ts"
```

---

## Parte C — tests, docs y pendientes

### 13. Tests

- `src/modules/store/domain/services/store-schedule.service.spec.ts`
  (nombre real `store-schedule.service.spec.ts` junto al archivo):
  casos — dentro del rango → abierto; antes/depués → cerrado; día
  `is_closed` → cerrado; rango nocturno (17:00→02:00) abierto a las
  18:00 y **también a la 01:00 del día siguiente** (gobernado por la
  fila de ayer); día siguiente cerrado (01:00 del lunes tras rango del
  domingo si lunes está cerrado → la cola de ayer aún cuenta).
- `src/modules/store/application/use-cases/get-store-config.use-case.spec.ts`
  — repo mockeado, devuelve `{settings, hours}`.
- `src/modules/store/application/services/store.service.spec.ts` —
  `getStoreConfig` + `storeConfig` + mapper mockeados; settings `null`
  → `DomainException`.
- `test/store/store-config.e2e-spec.ts` — espeja `get-catalog.e2e-spec.ts`
  (helpers de `test/support/e2e-app.ts`): 401 sin token; seed de
  settings+hours vía `DataSource`; 200 con la forma del contrato
  (`isOpen`, `today`, `weeklyHours` de 7 filas).

### 14. Documentación

- `documentacion/api/store/001-get-store-config.md` — formato
  `api-docs`, JSON real verificado con el e2e.
- `documentacion/api/README.md` — fila `GET /store/config` 🔶.
- `documentacion/modelo-de-datos.md` — en la tabla `orders`: reemplazar
  la nota de índices por la implementación real
  (`UNIQUE(order_date, order_number)` — consecutivo diario por día de
  negocio) y agregar la fila `order_date` a la tabla.
- `pendientes/008-indices-junction-catalogo.md` — marcar
  `✅ RESUELTO (propuesta 013)` con la migración.
- `pendientes/010-nequi-conecta-onboarding.md` — **nuevo**: dependencia
  externa — llaves QA de Nequi Conecta ("Pagos con Push"), certificación
  (5 casos: aprobado, rechazado, expirado, celular sin Nequi, reverso)
  y llaves de producción. Bloquea la integración real de `payments`;
  no bloquea el módulo orders (adapter simulado en dev).

---

## Decisiones embebidas (para revisar en la encuesta)

1. **`order_number` consecutivo diario** con columna `order_date` +
   `UNIQUE(order_date, order_number)` (vs. global continuo — el modelo
   deja ambas abiertas).
2. **`day_of_week` 0=domingo** (convención JS `getDay()`/PG `dow`).
3. **`is_open` derivado**, nunca persistido — la "hora del negocio" sale
   de `STORE_TIMEZONE` (default `America/Bogota`, env var nueva).
4. **Sin override manual** de cerrado — igual que el modelo; si hace
   falta es migración futura.
5. **Valores seed placeholder**: fee $2.000, mínimo delivery $10.000,
   lun cerrado, mar–sáb 17–23, dom 16–23, 4 mesas, dirección del local
   real (Cl. 7ª, Pueblo Nuevo, Arauquita).
6. **`GET /store/config` con JWT** (como `/catalog`, no `@Public`).
7. **Las 7 tablas ahora** (incluidas `payments` y `tables`) aunque sus
   endpoints lleguen en 014/015 — el modelo ya está aprobado.
8. **Pendiente 008 en esta misma propuesta** (dos índices) en vez de
   propuesta aparte.
9. `store_settings` ausente → **404 `store_not_configured`** (error de
   despliegue) — nunca un "abierto" falso.
10. **RLS no aplica** — single-tenant, sin `tenant_id`.

---

## Orden de aplicación recomendado

1. Enums y entidades de dominio (store, orders, payments) + `StoreSchedule`
2. Schemas ×7
3. `migration:create` → `CreateOrdersModuleTables` + `AddCatalogJunctionIndexes` → `migration:run` en dev **y** test + `revert` en test + re-run
4. `store.config.ts` + `env.validation` + `.env`/`.env.test`/`.env.example`
5. Endpoint en orden dev: controller → dto → mapper → use-case → repo interface → service → repository → module → `app.module`
6. `store.seed.ts` + `seed:store` → correr en dev
7. Tests unitarios + e2e (`npm run build`, `npm run test`, `npm run test:e2e`)
8. Docs (api + README + modelo) + cierre 008 + pendiente 010
9. `npx tsc --noEmit` + ESLint limpio
