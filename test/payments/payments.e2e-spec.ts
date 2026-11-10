import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Category } from '../../src/modules/catalog/domain/entities/category.entity';
import { Product } from '../../src/modules/catalog/domain/entities/product.entity';
import { BusinessHour } from '../../src/modules/store/domain/entities/business-hour.entity';
import { StoreSettings } from '../../src/modules/store/domain/entities/store-settings.entity';
import {
  activateAndGetTokens,
  cleanAuthTables,
  createE2EApp,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

// POST /payments/webhook/:provider — público con x-webhook-secret.
// El flujo completo: POST /orders transfer despacha el push por el
// gateway sim (provider 'sim', referencia sim-<uuid> persistida) y el
// webhook resuelve el pago sobre el agregado orden+pago.
describe('/payments/webhook/:provider (e2e)', () => {
  let app: INestApplication;
  const email = 'payments@test.com';
  let tokens: { accessToken: string; refreshToken: string };
  let webhookSecret: string;
  let product: Product;

  function server(): App {
    return app.getHttpServer() as App;
  }
  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function cleanCatalogTables(): Promise<void> {
    const ds = app.get(DataSource);
    await ds.query(
      'TRUNCATE product_modifier_options, product_modifier_groups, modifier_options, modifier_groups, combo_items, product_images, products, categories RESTART IDENTITY CASCADE',
    );
  }

  async function cleanStoreTables(): Promise<void> {
    const ds = app.get(DataSource);
    await ds.query(
      'TRUNCATE store_settings, business_hours, tables RESTART IDENTITY CASCADE',
    );
  }

  async function seedMenu(): Promise<void> {
    const ds = app.get(DataSource);
    const category = await ds.getRepository(Category).save({
      name: 'Perros',
      slug: 'perros',
      sortOrder: 0,
    });
    product = await ds.getRepository(Product).save({
      categoryId: category.id,
      name: 'El Cachorro',
      slug: 'el-cachorro',
      basePrice: 14000,
      sortOrder: 0,
    });
  }

  // Semana siempre-abierta (00:00→00:00, 24h, los 7 días) — determinista.
  async function seedStore(): Promise<void> {
    const ds = app.get(DataSource);
    await ds.getRepository(StoreSettings).save({
      name: 'Depredadog',
      deliveryFee: 2000,
      minDeliveryOrder: 10000,
    });
    await ds.getRepository(BusinessHour).save(
      [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        dayOfWeek: d,
        opensAt: '00:00',
        closesAt: '00:00',
        isClosed: false,
      })),
    );
  }

  // pickup + transfer — despacha el push sim en el POST /orders.
  async function postTransferOrder(): Promise<Record<string, unknown>> {
    const res = await request(server())
      .post('/orders')
      .set(auth(tokens.accessToken))
      .send({
        serviceType: 'pickup',
        items: [{ productId: product.id, quantity: 1, modifiers: [] }],
        paymentMethod: 'transfer',
        payerPhone: '3001234567',
      })
      .expect(201);
    return res.body as Record<string, unknown>;
  }

  function webhook(
    provider: string,
    body: Record<string, unknown>,
    secret = webhookSecret,
  ) {
    return request(server())
      .post(`/payments/webhook/${provider}`)
      .set('x-webhook-secret', secret)
      .send(body);
  }

  beforeAll(async () => {
    app = await createE2EApp();
    webhookSecret = app
      .get(ConfigService)
      .get<string>('PAYMENT_WEBHOOK_SECRET')!;
  });

  beforeEach(async () => {
    await cleanCatalogTables();
    await cleanStoreTables();
    await cleanAuthTables(app);
    await registerUser(app, { email });
    tokens = await activateAndGetTokens(app, email);
    await seedMenu();
    await seedStore();
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('orden transfer → POST despacha push sim (provider+reference en la respuesta) → webhook approved → confirmed + paid', async () => {
    const created = await postTransferOrder();
    const payment = created.payment as Record<string, unknown>;
    expect(payment.provider).toBe('sim');
    expect(payment.providerReference).toMatch(/^sim-/);
    expect(payment.status).toBe('pending');

    const res = await webhook('sim', {
      reference: payment.providerReference,
      status: 'approved',
      payload: { raw: 'provider-body' },
    }).expect(200);
    const resolved = res.body as Record<string, unknown>;
    expect(resolved.id).toBe(created.id);
    expect(resolved.status).toBe('confirmed');
    const resolvedPayment = resolved.payment as Record<string, unknown>;
    expect(resolvedPayment.status).toBe('paid');

    // El detalle del cliente confirma lo persistido.
    const detail = await request(server())
      .get(`/orders/${created.id as string}`)
      .set(auth(tokens.accessToken))
      .expect(200);
    expect((detail.body as Record<string, unknown>).status).toBe('confirmed');
    expect(
      (
        (detail.body as Record<string, unknown>).payment as Record<
          string,
          unknown
        >
      ).status,
    ).toBe('paid');
  });

  it('webhook rejected → cancelled + failed + razón en español', async () => {
    const created = await postTransferOrder();
    const payment = created.payment as Record<string, unknown>;

    const res = await webhook('sim', {
      reference: payment.providerReference,
      status: 'rejected',
    }).expect(200);
    const resolved = res.body as Record<string, unknown>;
    expect(resolved.status).toBe('cancelled');
    expect(resolved.cancelReason).toBe('Pago rechazado por el proveedor');
    expect((resolved.payment as Record<string, unknown>).status).toBe('failed');
  });

  it('webhook expired y cancelled → cancelled + failed con su razón', async () => {
    const expiredOrder = await postTransferOrder();
    const res1 = await webhook('sim', {
      reference: (expiredOrder.payment as Record<string, unknown>)
        .providerReference,
      status: 'expired',
    }).expect(200);
    expect((res1.body as Record<string, unknown>).cancelReason).toBe(
      'El pago expiró sin aprobación',
    );

    const cancelledOrder = await postTransferOrder();
    const res2 = await webhook('sim', {
      reference: (cancelledOrder.payment as Record<string, unknown>)
        .providerReference,
      status: 'cancelled',
    }).expect(200);
    const body2 = res2.body as Record<string, unknown>;
    expect(body2.status).toBe('cancelled');
    expect(body2.cancelReason).toBe('Pago cancelado por el proveedor');
    expect((body2.payment as Record<string, unknown>).status).toBe('failed');
  });

  it('referencia inventada → 404 PAYMENT_NOT_FOUND', async () => {
    const res = await webhook('sim', {
      reference: 'sim-inventada',
      status: 'approved',
    }).expect(404);
    expect((res.body as { errorCode?: string }).errorCode).toBe(
      'PAYMENT_NOT_FOUND',
    );
    expect((res.body as { message: string }).message).toBe('Payment not found');
  });

  it('webhook repetido → 200 idempotente sin tocar la orden', async () => {
    const created = await postTransferOrder();
    const reference = (created.payment as Record<string, unknown>)
      .providerReference as string;
    await webhook('sim', { reference, status: 'approved' }).expect(200);

    // El retry del proveedor (mismo payload) responde 200 sin revertir.
    const again = await webhook('sim', {
      reference,
      status: 'approved',
    }).expect(200);
    expect((again.body as Record<string, unknown>).status).toBe('confirmed');
    expect(
      (
        (again.body as Record<string, unknown>).payment as Record<
          string,
          unknown
        >
      ).status,
    ).toBe('paid');

    // Un retry contradictorio tampoco revierte lo ya resuelto.
    const contradictory = await webhook('sim', {
      reference,
      status: 'rejected',
    }).expect(200);
    expect((contradictory.body as Record<string, unknown>).status).toBe(
      'confirmed',
    );
    expect(
      (
        (contradictory.body as Record<string, unknown>).payment as Record<
          string,
          unknown
        >
      ).status,
    ).toBe('paid');
  });

  it('cancel del cliente gana el claim: webhook approved tardío → 200 idempotente, cancelled + failed', async () => {
    const created = await postTransferOrder();
    const reference = (created.payment as Record<string, unknown>)
      .providerReference as string;

    await request(server())
      .post(`/orders/${created.id as string}/cancel`)
      .set(auth(tokens.accessToken))
      .send({})
      .expect(201);

    // El cancel ya consumió el claim del payment (pending→failed) —
    // la aprobación tardía es no-op y la orden jamás resucita.
    const res = await webhook('sim', {
      reference,
      status: 'approved',
    }).expect(200);
    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe('cancelled');
    expect((body.payment as Record<string, unknown>).status).toBe('failed');
  });

  it('webhook approved primero: el cancel del cliente → 409 ORDER_NOT_CANCELLABLE, orden confirmed + paid', async () => {
    const created = await postTransferOrder();
    const reference = (created.payment as Record<string, unknown>)
      .providerReference as string;
    await webhook('sim', { reference, status: 'approved' }).expect(200);

    const res = await request(server())
      .post(`/orders/${created.id as string}/cancel`)
      .set(auth(tokens.accessToken))
      .send({})
      .expect(409);
    expect((res.body as { errorCode?: string }).errorCode).toBe(
      'ORDER_NOT_CANCELLABLE',
    );

    const detail = await request(server())
      .get(`/orders/${created.id as string}`)
      .set(auth(tokens.accessToken))
      .expect(200);
    const body = detail.body as Record<string, unknown>;
    expect(body.status).toBe('confirmed');
    expect((body.payment as Record<string, unknown>).status).toBe('paid');
  });

  it('secreto inválido → 401; sin header → 401', async () => {
    await webhook(
      'sim',
      { reference: 'x', status: 'approved' },
      'mal-secreto',
    ).expect(401);
    await request(server())
      .post('/payments/webhook/sim')
      .send({ reference: 'x', status: 'approved' })
      .expect(401);
  });

  it('sin PAYMENT_WEBHOOK_SECRET configurado → 400 Webhook is not configured', async () => {
    const spy = jest.spyOn(ConfigService.prototype, 'get');
    const original = spy.getMockImplementation() as (
      this: unknown,
      key: string,
      ...args: unknown[]
    ) => unknown;
    spy.mockImplementation(function (
      this: unknown,
      key: string,
      ...args: unknown[]
    ) {
      if (key === 'payment.webhookSecret') return undefined;
      return original.call(this, key, ...args);
    });
    try {
      const res = await webhook('sim', {
        reference: 'x',
        status: 'approved',
      }).expect(400);
      expect((res.body as { message: string }).message).toBe(
        'Webhook is not configured',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('status fuera del contrato → 400 de validación', async () => {
    await webhook('sim', { reference: 'x', status: 'pending' }).expect(400);
  });
});
