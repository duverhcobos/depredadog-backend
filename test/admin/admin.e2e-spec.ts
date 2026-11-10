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

// El dueño del local: cola, transiciones de estado, confirmación de
// cobro manual y pedidos presenciales dine_in/pickup — todo bajo
// @Roles('admin') (rol 'customer' → 403 en los 5 endpoints).
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
  // partida del flujo del dueño (confirmed → paid → done).
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

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanCatalogTables();
    await cleanStoreTables();
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

  it('rol customer → 403 en los 5 endpoints; sin token → 401', async () => {
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
    // Sin JWT el guard global responde antes → 401.
    await request(server()).get('/admin/orders').expect(401);
    await request(server()).get('/admin/tables').expect(401);
  });

  it('flujo cash completo: cola → confirmed → confirm-payment → done', async () => {
    const created = await postDeliveryCashOrder();
    const orderId = created.id as string;

    // La cola del local muestra el pedido online con su cliente.
    const queue = await request(server())
      .get('/admin/orders?bucket=active')
      .set(auth(adminTokens.accessToken))
      .expect(200);
    const queueBody = queue.body as {
      items: Record<string, unknown>[];
      total: number;
    };
    expect(queueBody.total).toBe(1);
    expect(queueBody.items[0].id).toBe(orderId);
    expect(queueBody.items[0].channel).toBe('online');
    expect(queueBody.items[0].customerName).toBe('Test User');
    expect(queueBody.items[0].tableLabel).toBeNull();

    // done sin cobrar → 409 PAYMENT_NOT_SETTLED.
    const early = await request(server())
      .patch(`/admin/orders/${orderId}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to: 'confirmed' })
      .expect(200);
    expect((early.body as Record<string, unknown>).status).toBe('confirmed');

    const notSettled = await request(server())
      .patch(`/admin/orders/${orderId}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to: 'done' })
      .expect(409);
    expect(notSettled.body.errorCode).toBe('PAYMENT_NOT_SETTLED');

    // El dueño marca el cobro → paid; el pedido ya puede cerrarse.
    const paid = await request(server())
      .post(`/admin/orders/${orderId}/confirm-payment`)
      .set(auth(adminTokens.accessToken))
      .expect(200);
    const paidBody = paid.body as Record<string, unknown>;
    expect((paidBody.payment as Record<string, unknown>).status).toBe('paid');
    // Idempotente — doble tap responde igual sin error.
    await request(server())
      .post(`/admin/orders/${orderId}/confirm-payment`)
      .set(auth(adminTokens.accessToken))
      .expect(200);

    const done = await request(server())
      .patch(`/admin/orders/${orderId}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to: 'done' })
      .expect(200);
    expect((done.body as Record<string, unknown>).status).toBe('done');

    // Ya no está en la cola — pasó a history.
    const after = await request(server())
      .get('/admin/orders?bucket=active')
      .set(auth(adminTokens.accessToken))
      .expect(200);
    expect((after.body as { items: unknown[] }).items).toHaveLength(0);
    const history = await request(server())
      .get('/admin/orders?bucket=history')
      .set(auth(adminTokens.accessToken))
      .expect(200);
    expect((history.body as { total: number }).total).toBe(1);
  });

  it("to:'preparing' → 400 (fuera del contrato) y pending→done → 409", async () => {
    const created = await postDeliveryCashOrder();
    const orderId = created.id as string;

    // 'preparing' no entra al DTO — validación 400 sin errorCode.
    await request(server())
      .patch(`/admin/orders/${orderId}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to: 'preparing' })
      .expect(400);

    // pending→done de un salto: la matriz lo rechaza antes del write.
    const jump = await request(server())
      .patch(`/admin/orders/${orderId}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to: 'done' })
      .expect(409);
    expect(jump.body.errorCode).toBe('INVALID_STATUS_TRANSITION');

    // Inexistente → 404 ORDER_NOT_FOUND.
    const ghost = await request(server())
      .patch(`/admin/orders/${randomUUID()}/status`)
      .set(auth(adminTokens.accessToken))
      .send({ to: 'confirmed' })
      .expect(404);
    expect(ghost.body.errorCode).toBe('ORDER_NOT_FOUND');
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
    const payment = body.payment as Record<string, unknown>;
    expect(payment.method).toBe('cash');
    expect(payment.status).toBe('pending');

    // La mesa quedó ocupada con el número del pedido vivo.
    const tables = await request(server())
      .get('/admin/tables')
      .set(auth(adminTokens.accessToken))
      .expect(200);
    const items = (tables.body as { items: Record<string, unknown>[] })
      .items;
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

  it('presencial pickup + cash → confirmed sin mesa', async () => {
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
    expect(body.status).toBe('confirmed');
    expect(body.channel).toBe('presencial');
    expect(body.tableLabel).toBeNull();
  });
});
