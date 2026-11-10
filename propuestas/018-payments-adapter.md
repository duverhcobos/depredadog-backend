# Propuesta: Módulo payments — puerto de pasarela + simulador dev + webhook de resolución

Hoy `POST /orders` crea la fila `payments` en `pending` y **nada la
resuelve**: no hay quién despache el cobro a Nequi ni quién reciba la
respuesta del proveedor. Esta propuesta crea el módulo `payments` como
hoja de integración (puerto `IPaymentGateway` + adapter simulado de
dev) y cierra el circuito en `orders`: el `transfer` despacha el push
al crear la orden y un webhook público resuelve el pago — aprobado →
`paid` + orden `confirmed`; rechazado/expirado/cancelado → `failed` +
orden `cancelled`. Misma forma que tendrá Nequi Conecta cuando lleguen
las llaves QA (pendiente 010) — el swap es un binding de provider.

**Decisión de frontera** (evita ciclo de módulos): `payments` es hoja
— solo integración con el proveedor (puerto + adapters). El webhook
vive en `orders` porque resolver un pago ES mutar el agregado
orden+pago en una sola tx (`saveAggregate` ya existe para eso).
Dirección única: `orders` → `payments`.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/payments/domain/services/payment-gateway.interface.ts` | **Nuevo** — puerto `IPaymentGateway` + token + tipos del comando/resultado |
| `src/modules/payments/domain/exceptions/payment-dispatch-failed.exception.ts` | **Nuevo** — 502 `PAYMENT_DISPATCH_FAILED` |
| `src/modules/payments/infrastructure/gateways/simulated-payment.gateway.ts` | **Nuevo** — adapter dev: "despacha" el push y devuelve referencia `sim-<uuid>` |
| `src/modules/payments/payments.module.ts` | **Nuevo** — provee y exporta `PAYMENT_GATEWAY` |
| `src/modules/orders/application/dtos/payment-webhook.dto.ts` | **Nuevo** — body del webhook |
| `src/modules/orders/application/use-cases/resolve-order-payment.use-case.ts` | **Nuevo** — transición agregado por resultado del proveedor (idempotente) |
| `src/modules/orders/domain/exceptions/payment-not-found.exception.ts` | **Nuevo** — 404 `PAYMENT_NOT_FOUND` (referencia desconocida) |
| `src/modules/orders/domain/repositories/order.repository.interface.ts` | +`findByProviderReference` |
| `src/modules/orders/infrastructure/repositories/order.repository.ts` | impl `findByProviderReference` (join payment) |
| `src/modules/orders/application/services/orders.service.ts` | +`resolveWebhook` (delegación) |
| `src/modules/orders/presentation/controllers/payments-webhook.controller.ts` | **Nuevo** — `POST /payments/webhook/:provider` `@Public()` + throttle + secreto |
| `src/modules/orders/application/use-cases/create-order.use-case.ts` | `transfer` → `gateway.initiatePush` antes de persistir |
| `src/modules/orders/orders.module.ts` | imports `PaymentsModule`, registra controller + use-case |
| `src/app.module.ts` | registra `PaymentsModule` |
| `.env.example` / `.env` | `PAYMENT_GATEWAY_DRIVER`, `PAYMENT_WEBHOOK_SECRET` |
| `documentacion/api/payments/001-post-payments-webhook-provider.md` | **Nuevo** doc del endpoint |
| `documentacion/api/README.md` | fila nueva |
| `documentacion/api/orders/001-post-orders.md` | `provider`/`providerReference` en respuestas transfer |
| Specs | `resolve-order-payment.use-case.spec.ts`, `simulated-payment.gateway.spec.ts`, +casos en `create-order.use-case.spec.ts` y `order.repository.spec.ts` |
| e2e | `test/payments/payments.e2e-spec.ts` — webhook resuelve/despacha/404/idempotente/secreto |

**Sin migraciones** — la tabla `payments` ya trae `provider`,
`provider_reference`, `provider_payload`, `confirmed_at` (§013).

---

## 1. `payments-webhook.controller.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/presentation/controllers/payments-webhook.controller.ts`

Vive en `orders` a propósito: resolver un pago muta el agregado
orden+pago (una sola tx) — `payments` queda como hoja de integración
sin dependencia de vuelta a `orders`. La ruta es honesta
(`/payments/webhook`) aunque el dueño del agregado sea orders.

```typescript
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../../common/decorators/public.decorator';
import { OrdersService } from '../../application/services/orders.service';
import { PaymentWebhookDto } from '../../application/dtos/payment-webhook.dto';
import { OrderResponseDto } from '../../application/dtos/order-response.dto';

// El proveedor notifica el resultado del cobro acá — público porque
// Nequi no manda JWT de usuario; la autenticación es el secreto
// compartido x-webhook-secret (sim hoy; firma del proveedor con las
// llaves reales — pendiente 010). Throttle agresivo: endpoint público.
@Controller('payments')
export class PaymentsWebhookController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('webhook/:provider')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  resolve(
    @Param('provider') provider: string,
    @Headers('x-webhook-secret') secret: string | undefined,
    @Body() dto: PaymentWebhookDto,
  ): Promise<OrderResponseDto> {
    const expected = this.config.get<string>('PAYMENT_WEBHOOK_SECRET');
    if (!expected) {
      // Sin secreto configurado el endpoint no existe — evita dejar
      // una puerta abierta en un ambiente mal provisionado.
      throw new BadRequestException('Webhook is not configured');
    }
    if (secret !== expected) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
    return this.ordersService.resolveWebhook(provider, dto);
  }
}
```

## 2. `orders.service.ts` (archivo existente — actualización)

**Ruta:** `src/modules/orders/application/services/orders.service.ts`

**Antes (constructor + último método):**

```typescript
    constructor(
        private readonly createOrder: CreateOrderUseCase,
        private readonly listMyOrders: ListMyOrdersUseCase,
        private readonly getMyOrder: GetMyOrderUseCase,
        private readonly cancelMyOrder: CancelMyOrderUseCase,
        private readonly mapper: OrderMapper,
    ) { }
```

**Después:**

```typescript
    constructor(
        private readonly createOrder: CreateOrderUseCase,
        private readonly listMyOrders: ListMyOrdersUseCase,
        private readonly getMyOrder: GetMyOrderUseCase,
        private readonly cancelMyOrder: CancelMyOrderUseCase,
        private readonly resolveOrderPayment: ResolveOrderPaymentUseCase,
        private readonly mapper: OrderMapper,
    ) { }
```

Y al final de la clase:

```typescript
    async resolveWebhook(
        provider: string,
        dto: PaymentWebhookDto,
    ): Promise<OrderResponseDto> {
        const order = await this.resolveOrderPayment.execute({
            provider,
            reference: dto.reference,
            status: dto.status,
            payload: dto.payload,
        });
        return this.mapper.toResponse(order);
    }
```

Imports a agregar arriba:

```typescript
import { PaymentWebhookDto } from '../dtos/payment-webhook.dto';
import { ResolveOrderPaymentUseCase } from '../use-cases/resolve-order-payment.use-case';
```

## 3. `payment-webhook.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/application/dtos/payment-webhook.dto.ts`

```typescript
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

// Contrato normalizado del webhook — el controller lo recibe del
// proveedor y el use-case no ve formatos externos. `status` usa los
// nombres del dominio (el adapter de cada proveedor traduce los suyos
// cuando lleguen las llaves reales).
export class PaymentWebhookDto {
  @IsString()
  reference!: string;

  @IsIn(['approved', 'rejected', 'expired', 'cancelled'])
  status!: 'approved' | 'rejected' | 'expired' | 'cancelled';

  /** Cuerpo crudo para auditoría — queda en provider_payload. */
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
```

## 4. `resolve-order-payment.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/application/use-cases/resolve-order-payment.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { PaymentStatus } from '../../../payments/domain/enums/payment-status.enum';
import { Order } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { PaymentNotFoundException } from '../../domain/exceptions/payment-not-found.exception';
import {
  type IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';

export type WebhookPaymentStatus =
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export interface ResolveOrderPaymentCommand {
  provider: string;
  reference: string;
  status: WebhookPaymentStatus;
  payload?: Record<string, unknown>;
}

// Razones en español — cancel_reason es user-facing (la app lo muestra
// en el detalle del historial, igual que 'Cancelado por el cliente').
const CANCEL_REASON: Record<string, string> = {
  rejected: 'Pago rechazado por el proveedor',
  expired: 'El pago expiró sin aprobación',
  cancelled: 'Pago cancelado por el proveedor',
};

@Injectable()
export class ResolveOrderPaymentUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
  ) {}

  async execute(cmd: ResolveOrderPaymentCommand): Promise<Order> {
    const order = await this.orders.findByProviderReference(
      cmd.provider,
      cmd.reference,
    );
    if (!order?.payment) {
      throw new PaymentNotFoundException();
    }
    // Idempotente: el proveedor reintenta webhooks — un pago ya
    // resuelto responde 200 sin tocar nada (la orden pudo avanzar o
    // haberse cancelado por otra vía; nunca se revierte).
    if (order.payment.status !== PaymentStatus.PENDING) {
      return order;
    }
    order.payment.providerPayload = cmd.payload ?? null;
    if (cmd.status === 'approved') {
      order.payment.status = PaymentStatus.PAID;
      order.payment.confirmedAt = new Date();
      // Solo un pedido vivo se confirma — si el cliente ya lo canceló
      // el pago aprobado queda registrado sin resucitar la orden.
      if (order.status === OrderStatus.PENDING) {
        order.status = OrderStatus.CONFIRMED;
      }
    } else {
      order.payment.status = PaymentStatus.FAILED;
      if (order.status === OrderStatus.PENDING) {
        order.status = OrderStatus.CANCELLED;
        order.cancelReason = CANCEL_REASON[cmd.status];
      }
    }
    return this.orders.saveAggregate(order);
  }
}
```

## 5. `payment-not-found.exception.ts` (archivo nuevo)

**Ruta:** `src/modules/orders/domain/exceptions/payment-not-found.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

// Webhook con provider_reference desconocida — 404, no 200: el
// proveedor debe saber que esa referencia no existe acá (nunca se
// despachó o llegó con el provider equivocado).
export class PaymentNotFoundException extends DomainException {
  constructor() {
    super('Payment not found', 404, 'PAYMENT_NOT_FOUND');
  }
}
```

## 6. `order.repository.interface.ts` (archivo existente — actualización)

**Ruta:** `src/modules/orders/domain/repositories/order.repository.interface.ts`

**Después de `findByIdForCustomer`:**

```typescript
  /** IDOR-safe: null si no existe O si no es del cliente. */
  findByIdForCustomer(id: string, customerId: string): Promise<Order | null>;
  /**
   * Orden dueña del pago vivo con esa referencia de proveedor —
   * el webhook la resuelve por (provider, provider_reference).
   * Carga el payment; ítems no hacen falta para la transición.
   */
  findByProviderReference(
    provider: string,
    reference: string,
  ): Promise<Order | null>;
```

## 7. `order.repository.ts` (archivo existente — actualización)

**Ruta:** `src/modules/orders/infrastructure/repositories/order.repository.ts`

**Después de `findByIdForCustomer`:**

```typescript
  async findByProviderReference(
    provider: string,
    reference: string,
  ): Promise<Order | null> {
    const row = await this.payments.findOne({
      where: { provider, providerReference: reference },
    });
    if (!row) return null;
    // El pago apunta a su orden — cargar el agregado por id (sin
    // filtro de cliente: el webhook no trae JWT, la referencia ES la
    // llave secreta que solo conoce quien despachó).
    const order = await this.orders.findOne({ where: { id: row.orderId } });
    if (order) order.payment = row;
    return order;
  }
```

## 8. `payment-gateway.interface.ts` (archivo nuevo)

**Ruta:** `src/modules/payments/domain/services/payment-gateway.interface.ts`

```typescript
export interface InitiatePushCommand {
  /** Monto en centavos? — NO: el dominio maneja pesos enteros (numeric(10,2)). */
  amount: number;
  /** Celular colombiano que recibe el push (3XX XXX XXXX, plano). */
  payerPhone: string;
  /** Referencia idempotente del lado del negocio — clientRequestId
   * cuando el cliente la mandó; el adapter la usa como llave externa. */
  referenceHint?: string;
}

export interface PushDispatchResult {
  /** 'sim' en dev; 'nequi' con las llaves reales. */
  provider: string;
  /** Id de transacción del proveedor — llave del webhook. */
  reference: string;
}

// Puerto del proveedor de cobro por push (Nequi "Pagos con Push").
// Solo sabe despachar el cobro — la resolución llega por webhook y es
// responsabilidad del dueño del agregado (orders).
// El adapter Nequi real (pendiente 010) implementa esta misma forma:
// mismo método, otro binding en el módulo.
export interface IPaymentGateway {
  initiatePush(cmd: InitiatePushCommand): Promise<PushDispatchResult>;
}

export const PAYMENT_GATEWAY = Symbol('IPaymentGateway');
```

## 9. `payment-dispatch-failed.exception.ts` (archivo nuevo)

**Ruta:** `src/modules/payments/domain/exceptions/payment-dispatch-failed.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

// El push no salió (celular sin cuenta, proveedor caído, timeout) —
// 502 porque es falla del upstream; la orden NO se crea: el cliente
// corrige el medio de pago y reintenta con el mismo clientRequestId
// sin dejar pedidos huérfanos.
export class PaymentDispatchFailedException extends DomainException {
  constructor(detail = 'Payment could not be dispatched') {
    super(detail, 502, 'PAYMENT_DISPATCH_FAILED');
  }
}
```

## 10. `simulated-payment.gateway.ts` (archivo nuevo)

**Ruta:** `src/modules/payments/infrastructure/gateways/simulated-payment.gateway.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  type InitiatePushCommand,
  type IPaymentGateway,
  type PushDispatchResult,
} from '../../domain/services/payment-gateway.interface';

// Adapter dev — "despacha" el cobro logueándolo y devolviendo una
// referencia sim-<uuid>. La resolución se ejercita con el MISMO
// webhook real: POST /payments/webhook/sim { reference, status } con
// el secreto. Así el flujo pending→paid/failed se prueba de punta a
// punta sin tocar Nequi y el caso de certificación futuro usa el
// mismo camino de código.
@Injectable()
export class SimulatedPaymentGateway implements IPaymentGateway {
  private readonly logger = new Logger(SimulatedPaymentGateway.name);

  initiatePush(cmd: InitiatePushCommand): Promise<PushDispatchResult> {
    const reference = `sim-${randomUUID()}`;
    this.logger.log(
      `[SIM] push → ${cmd.payerPhone} por $${cmd.amount} ` +
        `(ref ${reference})`,
    );
    return Promise.resolve({ provider: 'sim', reference });
  }
}
```

## 11. `payments.module.ts` (archivo nuevo)

**Ruta:** `src/modules/payments/payments.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { PAYMENT_GATEWAY } from './domain/services/payment-gateway.interface';
import { SimulatedPaymentGateway } from './infrastructure/gateways/simulated-payment.gateway';

// Hoja de integración de pagos — exporta solo el puerto. Driver via
// env PAYMENT_GATEWAY_DRIVER ('sim' hoy; 'nequi' con las llaves QA —
// pendiente 010: el swap es este binding, no código de negocio).
@Module({
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      useClass: SimulatedPaymentGateway,
    },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentsModule {}
```

## 12. `create-order.use-case.ts` (archivo existente — actualización)

**Ruta:** `src/modules/orders/application/use-cases/create-order.use-case.ts`

**Antes (constructor — extracto):**

```typescript
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
    ...
```

**Después:**

```typescript
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: IOrderRepository,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: IPaymentGateway,
    ...
```

Import:

```typescript
import {
  type IPaymentGateway,
  PAYMENT_GATEWAY,
} from '../../../payments/domain/services/payment-gateway.interface';
```

**Antes (cuerpo del execute — extracto):**

```typescript
    await this.fillDeliverySnapshot(cmd, order); // addressId XOR newAddress
    order.payment = this.buildPayment(cmd, order.total);
    return this.orders.createAggregate(order);
```

**Después:**

```typescript
    await this.fillDeliverySnapshot(cmd, order); // addressId XOR newAddress
    order.payment = await this.buildPayment(cmd, order.total);
    return this.orders.createAggregate(order);
```

**Antes (buildPayment):**

```typescript
  private buildPayment(cmd: CreateOrderCommand, total: number): Payment {
    const p = new Payment();
    p.method = cmd.paymentMethod as PaymentMethod;
    p.status = PaymentStatus.PENDING;
    p.payerPhone = cmd.paymentMethod === 'transfer' ? cmd.payerPhone! : null;
    ...
    return p;
  }
```

**Después:**

```typescript
  private async buildPayment(
    cmd: CreateOrderCommand,
    total: number,
  ): Promise<Payment> {
    const p = new Payment();
    p.method = cmd.paymentMethod as PaymentMethod;
    p.status = PaymentStatus.PENDING;
    p.payerPhone = cmd.paymentMethod === 'transfer' ? cmd.payerPhone! : null;
    // Transfer = cobro por push (Nequi en prod, sim en dev): se
    // despacha ANTES de persistir — si el proveedor no lo acepta la
    // orden nace ni siquiera (fail-fast, el cliente corrige y
    // reintenta con el mismo clientRequestId). Cash no toca gateway:
    // queda pending a la confirmación del dueño.
    if (cmd.paymentMethod === 'transfer') {
      const dispatched = await this.gateway.initiatePush({
        amount: total,
        payerPhone: cmd.payerPhone!,
        referenceHint: cmd.clientRequestId ?? undefined,
      });
      p.provider = dispatched.provider;
      p.providerReference = dispatched.reference;
    }
    ...
    return p;
  }
```

## 13. `orders.module.ts` (archivo existente — actualización)

**Ruta:** `src/modules/orders/orders.module.ts`

**Después:**

```typescript
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
    PaymentsModule,
  ],
  controllers: [OrdersController, PaymentsWebhookController],
  providers: [
    OrdersService,
    OrderMapper,
    CreateOrderUseCase,
    ListMyOrdersUseCase,
    GetMyOrderUseCase,
    CancelMyOrderUseCase,
    ResolveOrderPaymentUseCase,
    { provide: ORDER_REPOSITORY, useClass: OrderRepository },
  ],
```

Imports: `PaymentsModule`, `PaymentsWebhookController`,
`ResolveOrderPaymentUseCase`.

## 14. `app.module.ts` (archivo existente — actualización)

**Ruta:** `src/app.module.ts`

Registrar `PaymentsModule` en `imports` (junto a `OrdersModule`).

## 15. `.env.example` / `.env` (archivos existentes — actualización)

```bash
# Pagos — driver del puerto de pasarela ('sim' dev; 'nequi' con llaves QA)
PAYMENT_GATEWAY_DRIVER=sim
# Secreto compartido del webhook de pagos (header x-webhook-secret)
PAYMENT_WEBHOOK_SECRET=dev-webhook-secret
```

## 16. Documentación de API

- `documentacion/api/payments/001-post-payments-webhook-provider.md` —
  endpoint público, secreto por header, body `{reference, status,
  payload?}`, respuestas 200 (orden resuelta/idempotente), 400/401
  (sin secreto configurado / secreto inválido), 404
  `PAYMENT_NOT_FOUND`, 429 throttle.
- `documentacion/api/README.md` — fila del endpoint.
- `documentacion/api/orders/001-post-orders.md` — la respuesta de una
  orden `transfer` ahora trae `payment.provider` y
  `payment.providerReference` poblados.

## 17. Tests

- `resolve-order-payment.use-case.spec.ts`: approved→paid+confirmed;
  rejected/expired/cancelled→failed+cancelled+razón; referencia
  desconocida→404; pago ya resuelto→idempotente no-op; orden ya
  cancelada por el cliente→payment registrado sin resucitar la orden.
- `simulated-payment.gateway.spec.ts`: devuelve provider 'sim' +
  referencia `sim-` única.
- `create-order.use-case.spec.ts`: transfer llama `initiatePush` con
  amount/payerPhone y persiste provider+reference; cash NO lo llama;
  dispatch que lanza `PaymentDispatchFailedException` → la excepción
  viaja y `createAggregate` nunca se llama.
- `order.repository.spec.ts`: `findByProviderReference` encuentra la
  orden con su payment; referencia inexistente → null.
- `test/payments/payments.e2e-spec.ts`: crear orden transfer real →
  webhook sim `approved` → orden `confirmed` + pago `paid`;
  `rejected` → `cancelled` + `failed` + razón; referencia inventada →
  404; webhook repetido → 200 idempotente; sin secreto / secreto malo
  → 400/401.

---

## Encuesta de revisión (2026-11-10)

- **Resolución sim**: webhook manual — en dev el usuario llama
  `POST /payments/webhook/sim` él mismo (ejercita el camino real
  pending→paid/failed que Nequi recorrerá solo en producción).
  Confirmado tras explicar el swap completo.
- **Auth del webhook**: `x-webhook-secret` obligado en TODO ambiente;
  sin `PAYMENT_WEBHOOK_SECRET` configurado → 400 (puerta cerrada si la
  provisión falla).
- **Falla de despacho**: fail-fast — `POST /orders` responde 502
  `PAYMENT_DISPATCH_FAILED` y la orden no se crea (reintento con el
  mismo `clientRequestId` sin huérfanos).
- **Alcance**: diferido — confirmación de cash por admin y reembolsos
  quedan para el módulo admin; transfer manual con `evidence_url`
  cuando el negocio lo pida.

## Orden de aplicación recomendado

1. `payments-webhook.controller.ts` (clase + constructor)
2. `orders.service.ts` (stub del método — referencia el DTO)
3. `payment-webhook.dto.ts`
4. `payments-webhook.controller.ts` (método completo)
5. `orders.service.ts` (delegación completa)
6. `resolve-order-payment.use-case.ts`
7. `payment-not-found.exception.ts`
8. `order.repository.interface.ts` + `order.repository.ts`
9. `payment-gateway.interface.ts`
10. `payment-dispatch-failed.exception.ts`
11. `simulated-payment.gateway.ts`
12. `payments.module.ts`
13. `create-order.use-case.ts` (wiring del gateway)
14. `orders.module.ts` + `app.module.ts`
15. `.env` / `.env.example`
16. specs + e2e
17. `documentacion/api/`

## Anexo — auditoría post-implementación (revisor)

Veredicto: **APROBADO CON OBSERVACIONES**. Correcciones aplicadas en la
misma rama antes del commit:

- **IMPORTANTE — read-check-write**: la resolución leía `payment.status`,
  decidía y luego `saveAggregate` — dos webhooks paralelos o un webhook
  contra el cancel del cliente podían revivir/encimar estados. Ahora el
  claim es atómico a nivel BD (`code-patterns` "consumo atómico"):
  - `IOrderRepository.resolvePaymentAggregate(order)` → en UNA tx:
    `UPDATE payments SET … WHERE id AND status='pending'` (claim);
    `affected=0` → `null` (otro resolvedor ganó → el use-case re-lee y
    responde idempotente). Con claim ganado, `UPDATE orders … WHERE
    status='pending'` — una orden cancelada jamás resucita.
  - `IOrderRepository.cancelPendingAggregate(order)` → mismo orden de
    locks (payments→orders, sin deadlock): claim condicional del payment
    (un `paid` nunca revierte a `failed`) + `UPDATE orders WHERE
    status='pending'`; `false` → `OrderNotCancellableException` — un
    cancel que pierde la carrera responde 409 honesto, no un falso éxito.
  - `saveAggregate` eliminado (su único consumidor era el cancel).
- **M — driver declarado y no leído**: `PaymentsModule` ahora usa
  `useFactory` con switch sobre `payment.driver`; driver desconocido
  falla en arranque (provisión rota no llega al primer cobro).
- **M — config sin namespace**: nuevo `src/config/payment.config.ts`
  (`payment.driver`, `payment.webhookSecret`), registrado en
  `ConfigModule.load` y `env.validation`.
- **M — comparación de secreto**: `crypto.timingSafeEqual` en vez de
  `!==` (tiempo constante).
- **M — precedencia 400/401**: documentada en el doc del endpoint
  (ValidationPipe corre antes del check del secreto; con Nequi la firma
  irá en un guard — queda en pendiente 010).
- **M — mapper spec**: asserts de `provider`/`providerReference` en
  `order.mapper.spec.ts`.
- **M — identificador**: `huerfana` → `orphaned` (convención inglés).
- **INFO aplicados**: `@IsNotEmpty` en `reference`; unión de estados del
  webhook unificada en `payments/domain/enums/webhook-status.enum.ts`
  (`WebhookStatus` — una sola fuente para DTO y use-case); notas de
  diseño del adapter real (firma en guard, respuesta mínima, ventana
  push/persistencia, índice único parcial) registradas en
  `pendientes/010-nequi-conecta-onboarding.md`; `gateways/` agregado a
  la skill `module-structure`; `nextNumber` migrado a generics de
  `em.query` (resuelve el `no-unnecessary-type-assertion` pre-existente).
- **Semántica que cambia con el claim atómico** (doc actualizado): si el
  cancel del cliente gana el claim, un `approved` tardío responde
  idempotente con payment `failed` (antes quedaba `paid` sobre orden
  cancelada). Quien gana el claim posee el estado final del payment.

Tests nuevos: spec de use-case (claim perdido → re-lectura), spec de
repo (4 casos de los métodos atómicos), spec de cancel
(`cancelPendingAggregate` → false ⇒ 409), e2e ×2 de carrera
(cancel→webhook; webhook→cancel 409).

Verificación final: `npm run build` limpio; unit **243/243**; e2e
**102/102**; eslint limpio en los archivos tocados.
