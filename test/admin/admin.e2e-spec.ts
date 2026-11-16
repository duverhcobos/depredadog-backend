import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import { Category } from '../../src/modules/catalog/domain/entities/category.entity';
import { Product } from '../../src/modules/catalog/domain/entities/product.entity';
import { BusinessHour } from '../../src/modules/store/domain/entities/business-hour.entity';
import { StoreSettings } from '../../src/modules/store/domain/entities/store-settings.entity';
import { StoreTable } from '../../src/modules/store/domain/entities/store-table.entity';
import {
  activateAndGetTokens,
  cleanAuthTables,
  createE2EApp,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

// El dueño del local: kanban de 5 carriles (§022 — pending → confirmed
// → preparing → ready → done, cancelled desde cualquier no terminal),
// confirmación de cobro que cobra Y avanza (§037.D), pedidos
// presenciales dine_in/pickup y el cierre de caja manual que archiva
// el día — todo bajo @Roles('admin') (rol 'customer' → 403).
describe('/admin (e2e)', () => {
  let app: INestApplication;
  const email = 'admin-customer@test.com';
  const ADMIN_EMAIL = 'admin@test.com';
  const ADMIN_PASSWORD = 'AdminPass1!';
  let tokens: { accessToken: string; refreshToken: string };
  let adminTokens: { accessToken: string; refreshToken: string };

  function server(): App {
    return app.getHttpServer() as App;
  }
  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  let product: Product;
  let mesa: StoreTable;

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

  // Cierra TODA orden previa + cierres — los buckets de admin ven el
  // local completo, no solo lo del test.
  async function cleanOrderTables(): Promise<void> {
    const ds = app.get(DataSource);
    await ds.query('TRUNCATE orders RESTART IDENTITY CASCADE');
    await ds.query('TRUNCATE day_closes CASCADE');
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

  // Semana siempre-abierta + una mesa — determinista.
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
    mesa = await ds.getRepository(StoreTable).save({ label: 'Mesa 1' });
  }

  // Admin directo en BD (mismo patrón del seed npm run seed:admin —
  // bcrypt del proyecto); login normal para tener el JWT con role.
  async function seedAdminAndLogin(): Promise<void> {
    const ds = app.get(DataSource);
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await ds.query(
      `INSERT INTO "users"
        ("email", "password_hash", "role", "status", "email_verified_at",
         "first_name", "first_last_name", "referral_code")
       VALUES ($1, $2, 'admin', 'active', now(), 'Admin', 'Depredadog', 'ADMINTST')`,
      [ADMIN_EMAIL, hash],
    );
    const res = await request(server())
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    adminTokens = res.body as { accessToken: string; refreshToken: string };
  }

  async function createAddress(): Promise<string> {
    const res = await request(server())
      .post('/addresses')
      .set(auth(tokens.accessToken))
      .send({
        label: 'Casa',
        landmark: 'Casa blanca frente a la cancha',
        neighborhood: 'Barrio Centro',
        type: 'home',
      })
      .expect(201);
    return (res.body as { id: string }).id;
  }

  // Pedido online pending con pago cash pendiente — el punto de
  // partida del kanban (pending → confirmed → preparing → ready →
  // done → cierre).
  async function postDeliveryCashOrder(): Promise<Record<string, unknown>> {
    const addressId = await createAddress();
    const res = await request(server())
      .post('/orders')
      .set(auth(tokens.accessToken))
      .send({
        serviceType: 'delivery',
        items: [{ productId: product.id, quantity: 1, modifiers: [] }],
        addressId,
        contactPhone: '3009876543',
        paymentMethod: 'cash',
      })
      .expect(201);
    return res.body as Record<string, unknown>;
  }

  async function patchStatus(
    orderId: string,
    to: string,
    extra: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const res = await request(server())
      .patch(`/admin/orders/${orderId}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to, ...extra })
      .expect(200);
    return res.body as Record<string, unknown>;
  }

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanCatalogTables();
    await cleanStoreTables();
    await cleanOrderTables();
    await cleanAuthTables(app);
    await registerUser(app, { email });
    tokens = await activateAndGetTokens(app, email);
    await seedMenu();
    await seedStore();
    await seedAdminAndLogin();
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('rol customer → 403 en todos los endpoints; sin token → 401', async () => {
    const id = randomUUID();
    await request(server())
      .get('/admin/orders')
      .set(auth(tokens.accessToken))
      .expect(403);
    await request(server())
      .patch(`/admin/orders/${id}/status`)
      .set(auth(tokens.accessToken))
      .send({ to: 'confirmed' })
      .expect(403);
    await request(server())
      .post(`/admin/orders/${id}/confirm-payment`)
      .set(auth(tokens.accessToken))
      .expect(403);
    await request(server())
      .post('/admin/orders')
      .set(auth(tokens.accessToken))
      .send({})
      .expect(403);
    await request(server())
      .get('/admin/tables')
      .set(auth(tokens.accessToken))
      .expect(403);
    await request(server())
      .get('/admin/day-close')
      .set(auth(tokens.accessToken))
      .expect(403);
    await request(server())
      .post('/admin/day-close')
      .set(auth(tokens.accessToken))
      .send({})
      .expect(403);
    // Sin JWT el guard global responde antes → 401.
    await request(server()).get('/admin/orders').expect(401);
    await request(server()).get('/admin/day-close').expect(401);
  });

  it('flujo cash completo: 5 carriles → confirm-payment entrega → done espera al cierre', async () => {
    const created = await postDeliveryCashOrder();
    const orderId = created.id as string;

    // La cola del local muestra el pedido online con su cliente y la
    // descomposición de la dirección (§037.B) + statusChangedAt (§037.A).
    const queue = await request(server())
      .get('/admin/orders?bucket=active')
      .set(auth(adminTokens.accessToken))
      .expect(200);
    const queueBody = queue.body as {
      items: Record<string, unknown>[];
      total: number;
    };
    expect(queueBody.total).toBe(1);
    const q0 = queueBody.items[0];
    expect(q0.id).toBe(orderId);
    expect(q0.channel).toBe('online');
    expect(q0.customerName).toBe('Test User');
    expect(q0.tableLabel).toBeNull();
    expect(q0.statusChangedAt).toBeTruthy();
    expect(q0.deliveryAddressLabel).toBe('Casa');
    expect(q0.deliveryLandmark).toBe('Casa blanca frente a la cancha');
    expect(q0.deliveryNeighborhood).toBe('Barrio Centro');

    // done sin cobrar y saltos: la matriz rechaza antes del write.
    const jump = await request(server())
      .patch(`/admin/orders/${orderId}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to: 'done' })
      .expect(409);
    expect(jump.body.errorCode).toBe('INVALID_STATUS_TRANSITION');

    // La cadena completa — cada paso re-sella statusChangedAt.
    let body = await patchStatus(orderId, 'confirmed');
    const t1 = body.statusChangedAt as string;
    body = await patchStatus(orderId, 'preparing');
    const t2 = body.statusChangedAt as string;
    expect(body.status).toBe('preparing');
    body = await patchStatus(orderId, 'ready');
    const t3 = body.statusChangedAt as string;
    expect(body.status).toBe('ready');
    expect(new Date(t3).getTime()).toBeGreaterThanOrEqual(
      new Date(t2).getTime(),
    );
    expect(new Date(t2).getTime()).toBeGreaterThanOrEqual(
      new Date(t1).getTime(),
    );

    // Cobro en 'ready' → pago + entrega en el mismo hecho (§037.D).
    const paid = await request(server())
      .post(`/admin/orders/${orderId}/confirm-payment`)
      .set(auth(adminTokens.accessToken))
      .expect(200);
    const paidBody = paid.body as Record<string, unknown>;
    expect((paidBody.payment as Record<string, unknown>).status).toBe('paid');
    expect(paidBody.status).toBe('done');
    // Idempotente — doble tap responde igual sin otro write.
    const again = await request(server())
      .post(`/admin/orders/${orderId}/confirm-payment`)
      .set(auth(adminTokens.accessToken))
      .expect(200);
    expect((again.body as Record<string, unknown>).status).toBe('done');

    // El entregado NO sale de Cocina hasta el cierre de caja (§022).
    const stillThere = await request(server())
      .get('/admin/orders?bucket=active')
      .set(auth(adminTokens.accessToken))
      .expect(200);
    const items = (stillThere.body as { items: Record<string, unknown>[] })
      .items;
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('done');
    // Y aún no es history.
    const emptyHist = await request(server())
      .get('/admin/orders?bucket=history')
      .set(auth(adminTokens.accessToken))
      .expect(200);
    expect((emptyHist.body as { total: number }).total).toBe(0);
  });

  it('matriz: confirmed→done es salto inválido (409); done directo exige pago (409)', async () => {
    const created = await postDeliveryCashOrder();
    const orderId = created.id as string;

    await patchStatus(orderId, 'confirmed');
    // confirmed→done: existe en la matriz vieja pero no en el kanban —
    // hay que pasar por preparing y ready.
    const jump = await request(server())
      .patch(`/admin/orders/${orderId}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to: 'done' })
      .expect(409);
    expect(jump.body.errorCode).toBe('INVALID_STATUS_TRANSITION');

    // 'pending' no entra al DTO — validación 400 sin errorCode.
    await request(server())
      .patch(`/admin/orders/${orderId}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to: 'pending' })
      .expect(400);

    // Inexistente → 404 ORDER_NOT_FOUND.
    const ghost = await request(server())
      .patch(`/admin/orders/${randomUUID()}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to: 'confirmed' })
      .expect(404);
    expect(ghost.body.errorCode).toBe('ORDER_NOT_FOUND');
  });

  it('done por PATCH exige payment settled — la puerta del cobro', async () => {
    const created = await postDeliveryCashOrder();
    const orderId = created.id as string;
    await patchStatus(orderId, 'confirmed');
    await patchStatus(orderId, 'preparing');
    await patchStatus(orderId, 'ready');

    // ready→done por PATCH sin cobrar → 409 PAYMENT_NOT_SETTLED.
    const notSettled = await request(server())
      .patch(`/admin/orders/${orderId}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to: 'done' })
      .expect(409);
    expect(notSettled.body.errorCode).toBe('PAYMENT_NOT_SETTLED');

    // Se cobra (que además entrega: ready→done) — misma orden queda done.
    const paid = await request(server())
      .post(`/admin/orders/${orderId}/confirm-payment`)
      .set(auth(adminTokens.accessToken))
      .expect(200);
    expect((paid.body as Record<string, unknown>).status).toBe('done');
  });

  it('cancel del dueño: cancelled + payment failed con razón', async () => {
    const created = await postDeliveryCashOrder();
    const orderId = created.id as string;

    const res = await request(server())
      .patch(`/admin/orders/${orderId}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to: 'cancelled', cancelReason: 'Se acabó la salchicha' })
      .expect(200);
    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe('cancelled');
    expect(body.cancelReason).toBe('Se acabó la salchicha');
    expect((body.payment as Record<string, unknown>).status).toBe('failed');

    // Terminal — nada más se puede hacer con la orden.
    await request(server())
      .patch(`/admin/orders/${orderId}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to: 'confirmed' })
      .expect(409);
    // Y el pago muerto no se confirma.
    const dead = await request(server())
      .post(`/admin/orders/${orderId}/confirm-payment`)
      .set(auth(adminTokens.accessToken))
      .expect(409);
    expect(dead.body.errorCode).toBe('PAYMENT_NOT_CONFIRMABLE');

    // El cancelado YA está en history aunque no haya cierre (§022).
    const history = await request(server())
      .get('/admin/orders?bucket=history')
      .set(auth(adminTokens.accessToken))
      .expect(200);
    expect((history.body as { total: number }).total).toBe(1);
  });

  it('presencial dine_in con mesa → nace confirmed y ocupa la mesa', async () => {
    const res = await request(server())
      .post('/admin/orders')
      .set(auth(adminTokens.accessToken))
      .send({
        serviceType: 'dine_in',
        tableId: mesa.id,
        items: [{ productId: product.id, quantity: 2, modifiers: [] }],
        paymentMethod: 'cash',
        notes: 'Sin picante en uno',
      })
      .expect(201);
    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe('confirmed'); // el local lo crea aceptado
    expect(body.channel).toBe('presencial');
    expect(body.serviceType).toBe('dine_in');
    expect(body.tableLabel).toBe('Mesa 1');
    expect(body.customerName).toBeNull();
    expect(body.total).toBe(28000);
    expect(body.deliveryFee).toBe(0);
    expect(body.statusChangedAt).toBeTruthy();
    const payment = body.payment as Record<string, unknown>;
    expect(payment.method).toBe('cash');
    expect(payment.status).toBe('pending');

    // La mesa quedó ocupada con el número del pedido vivo.
    const tables = await request(server())
      .get('/admin/tables')
      .set(auth(adminTokens.accessToken))
      .expect(200);
    const items = (tables.body as { items: Record<string, unknown>[] }).items;
    const ocupada = items.find((t) => t.id === mesa.id)!;
    expect(ocupada.activeOrderNumber).toBe(body.orderNumber);

    // dine_in sin mesa → 400; mesa inexistente → 404.
    await request(server())
      .post('/admin/orders')
      .set(auth(adminTokens.accessToken))
      .send({
        serviceType: 'dine_in',
        items: [{ productId: product.id, quantity: 1, modifiers: [] }],
        paymentMethod: 'cash',
      })
      .expect(400);
    const ghost = await request(server())
      .post('/admin/orders')
      .set(auth(adminTokens.accessToken))
      .send({
        serviceType: 'dine_in',
        tableId: randomUUID(),
        items: [{ productId: product.id, quantity: 1, modifiers: [] }],
        paymentMethod: 'cash',
      })
      .expect(404);
    expect(ghost.body.errorCode).toBe('TABLE_NOT_FOUND');

    // pickup presencial prohibe mesa → 400.
    await request(server())
      .post('/admin/orders')
      .set(auth(adminTokens.accessToken))
      .send({
        serviceType: 'pickup',
        tableId: mesa.id,
        items: [{ productId: product.id, quantity: 1, modifiers: [] }],
        paymentMethod: 'cash',
      })
      .expect(400);
  });

  it('presencial pickup nace pending; el cobro lo confirma (§037.D)', async () => {
    const res = await request(server())
      .post('/admin/orders')
      .set(auth(adminTokens.accessToken))
      .send({
        serviceType: 'pickup',
        items: [{ productId: product.id, quantity: 1, modifiers: [] }],
        paymentMethod: 'cash',
      })
      .expect(201);
    const body = res.body as Record<string, unknown>;
    const orderId = body.id as string;
    // La recogida espera en la bandeja — el cliente tarda en pagar
    // en el mostrador; la bandeja es el aviso.
    expect(body.status).toBe('pending');
    expect(body.channel).toBe('presencial');
    expect(body.tableLabel).toBeNull();

    // Sin cobrar no confirma — el cobro era la puerta (§037.D).
    const notSettled = await request(server())
      .patch(`/admin/orders/${orderId}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to: 'confirmed' })
      .expect(409);
    expect(notSettled.body.errorCode).toBe('PAYMENT_NOT_SETTLED');

    // Registrar pago → paid + confirmed en el mismo hecho.
    const paid = await request(server())
      .post(`/admin/orders/${orderId}/confirm-payment`)
      .set(auth(adminTokens.accessToken))
      .expect(200);
    const paidBody = paid.body as Record<string, unknown>;
    expect((paidBody.payment as Record<string, unknown>).status).toBe('paid');
    expect(paidBody.status).toBe('confirmed');
  });

  it('cierre de caja: preview → POST archiva done + cancelled y queda auditado', async () => {
    // Un delivery cash que llega a done y uno cancelado.
    const done = await postDeliveryCashOrder();
    const doneId = done.id as string;
    await patchStatus(doneId, 'confirmed');
    await patchStatus(doneId, 'preparing');
    await patchStatus(doneId, 'ready');
    await request(server())
      .post(`/admin/orders/${doneId}/confirm-payment`)
      .set(auth(adminTokens.accessToken))
      .expect(200);

    const cancelled = await postDeliveryCashOrder();
    await patchStatus(cancelled.id as string, 'cancelled', {
      cancelReason: 'Cliente desistió',
    });

    // Preview — solo lectura: refleja lo que el cierre va a archivar.
    const preview = await request(server())
      .get('/admin/day-close')
      .set(auth(adminTokens.accessToken))
      .expect(200);
    const p = preview.body as {
      orderCount: number;
      totalAmount: number;
      byMethod: { method: string; count: number; amount: number }[];
      cancelledCount: number;
      cancelledAmount: number;
      orders: { id: string; orderNumber: number; total: number }[];
    };
    expect(p.orderCount).toBe(1);
    expect(p.totalAmount).toBe(16000); // 14000 + 2000 de domicilio
    expect(p.byMethod).toEqual([{ method: 'cash', count: 1, amount: 16000 }]);
    expect(p.cancelledCount).toBe(1);
    expect(p.cancelledAmount).toBe(16000);
    expect(p.orders[0].id).toBe(doneId);

    // POST — el cierre archiva: los terminales se estampan con el id.
    const close = await request(server())
      .post('/admin/day-close')
      .set(auth(adminTokens.accessToken))
      .send({ note: 'Cierre de lunes' })
      .expect(201);
    const c = close.body as {
      id: string;
      closedAt: string;
      orderCount: number;
      totalAmount: number;
      note: string;
    };
    expect(c.id).toBeTruthy();
    expect(new Date(c.closedAt).toString()).not.toBe('Invalid Date');
    expect(c.orderCount).toBe(1);
    expect(c.note).toBe('Cierre de lunes');

    // Ambos terminales quedaron con day_close_id (el cancelado también
    // se estampa — su bucket ya era history por status).
    const ds = app.get(DataSource);
    const rows = await ds.query<
      { status: string; day_close_id: string | null }[]
    >(`SELECT status, day_close_id FROM orders ORDER BY created_at`);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.day_close_id)).toEqual([c.id, c.id]);

    // Active vacío — el done cerrado migró a history (con el cancelado).
    const active = await request(server())
      .get('/admin/orders?bucket=active')
      .set(auth(adminTokens.accessToken))
      .expect(200);
    expect((active.body as { total: number }).total).toBe(0);
    const history = await request(server())
      .get('/admin/orders?bucket=history')
      .set(auth(adminTokens.accessToken))
      .expect(200);
    expect((history.body as { total: number }).total).toBe(2);

    // Cierre vacío permitido — un segundo cierre queda en ceros.
    const empty = await request(server())
      .post('/admin/day-close')
      .set(auth(adminTokens.accessToken))
      .send({})
      .expect(201);
    const e = empty.body as {
      orderCount: number;
      totalAmount: number;
      cancelledCount: number;
      byMethod: unknown[];
    };
    expect(e.orderCount).toBe(0);
    expect(e.totalAmount).toBe(0);
    expect(e.cancelledCount).toBe(0);
    expect(e.byMethod).toEqual([]);
  });
});
