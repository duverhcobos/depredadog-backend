import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { Category } from '../../src/modules/catalog/domain/entities/category.entity';
import { ModifierGroup } from '../../src/modules/catalog/domain/entities/modifier-group.entity';
import { ModifierOption } from '../../src/modules/catalog/domain/entities/modifier-option.entity';
import { Product } from '../../src/modules/catalog/domain/entities/product.entity';
import { ProductModifierGroup } from '../../src/modules/catalog/domain/entities/product-modifier-group.entity';
import { ProductModifierOption } from '../../src/modules/catalog/domain/entities/product-modifier-option.entity';
import { BusinessHour } from '../../src/modules/store/domain/entities/business-hour.entity';
import { StoreSettings } from '../../src/modules/store/domain/entities/store-settings.entity';
import {
  activateAndGetTokens,
  cleanAuthTables,
  createE2EApp,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('/orders (e2e)', () => {
  let app: INestApplication;
  const email = 'orders@test.com';
  let tokens: { accessToken: string; refreshToken: string };

  function server(): App {
    return app.getHttpServer() as App;
  }
  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  let product: Product;
  let agotado: Product;
  let mozzarella: ModifierOption;
  let salchicha: ModifierOption;
  let tocineta: ModifierOption;

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
    agotado = await ds.getRepository(Product).save({
      categoryId: category.id,
      name: 'El Agotado',
      slug: 'el-agotado',
      basePrice: 15000,
      isAvailable: false,
      sortOrder: 1,
    });
    const group = await ds.getRepository(ModifierGroup).save({
      slug: 'ingredients',
      name: 'Ingredientes',
      minSelect: 0,
      maxSelect: null,
    });
    // Incluida, removible — el "sin queso" del cliente.
    mozzarella = await ds.getRepository(ModifierOption).save({
      groupId: group.id,
      name: 'Queso mozzarella',
      extraPrice: 3500,
      isRemovable: true,
      isAvailable: true,
      sortOrder: 0,
    });
    // Incluida, esencial, NO removible ni reemplazable (corazón).
    salchicha = await ds.getRepository(ModifierOption).save({
      groupId: group.id,
      name: 'Salchicha',
      extraPrice: 0,
      isRemovable: false,
      isAvailable: true,
      isReplaceable: false,
      isReplacementEligible: false,
      isEssential: true,
      sortOrder: 1,
    });
    // Extra pago — sin fila en product_modifier_options.
    tocineta = await ds.getRepository(ModifierOption).save({
      groupId: group.id,
      name: 'Tocineta',
      extraPrice: 2000,
      isRemovable: false,
      isAvailable: true,
      sortOrder: 2,
    });
    await ds.getRepository(ProductModifierGroup).save({
      productId: product.id,
      groupId: group.id,
    });
    await ds.getRepository(ProductModifierOption).save([
      {
        productId: product.id,
        optionId: mozzarella.id,
        includedByDefault: true,
        sortOrder: 0,
      },
      {
        productId: product.id,
        optionId: salchicha.id,
        includedByDefault: true,
        sortOrder: 1,
      },
    ]);
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

  // Horario que no cubre "ahora": los 7 días isClosed → 409 garantizado.
  async function seedStoreClosed(): Promise<void> {
    const ds = app.get(DataSource);
    await ds.getRepository(StoreSettings).save({ name: 'Depredadog' });
    await ds.getRepository(BusinessHour).save(
      [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        dayOfWeek: d,
        opensAt: '00:00',
        closesAt: '00:00',
        isClosed: true,
      })),
    );
  }

  function pickupTransferBody(): Record<string, unknown> {
    return {
      serviceType: 'pickup',
      items: [
        {
          productId: product.id,
          quantity: 1,
          modifiers: [{ optionId: tocineta.id, action: 'added' }],
        },
      ],
      paymentMethod: 'transfer',
      payerPhone: '3001234567',
    };
  }

  async function postOrder(
    body: Record<string, unknown>,
    token = tokens.accessToken,
    expected = 201,
  ): Promise<Record<string, unknown>> {
    const res = await request(server())
      .post('/orders')
      .set(auth(token))
      .send(body)
      .expect(expected);
    return res.body as Record<string, unknown>;
  }

  async function createAddress(
    token = tokens.accessToken,
  ): Promise<string> {
    const res = await request(server())
      .post('/addresses')
      .set(auth(token))
      .send({
        label: 'Casa',
        landmark: 'Casa blanca frente a la cancha',
        neighborhood: 'Barrio Centro',
        type: 'home',
      })
      .expect(201);
    return (res.body as { id: string }).id;
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
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('POST pickup + transfer + payerPhone → 201 con order_number=1 y pago pendiente', async () => {
    const body = await postOrder(pickupTransferBody());

    expect(body.orderNumber).toBe(1);
    expect(body.orderDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.status).toBe('pending');
    expect(body.serviceType).toBe('pickup');
    expect(body.contactPhone).toBeNull();
    expect(body.deliveryAddress).toBeNull();
    expect(body.deliveryFee).toBe(0);
    // total = base + delta del extra — precios SIEMPRE del servidor.
    expect(body.subtotal).toBe(16000);
    expect(body.total).toBe(16000);
    const items = body.items as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0].productName).toBe('El Cachorro');
    // Snapshots §016 — la app pinta foto y "Lleva:" con esto.
    expect(items[0].productSlug).toBe('el-cachorro');
    expect(items[0].includedNames).toEqual([
      'Queso mozzarella',
      'Salchicha',
    ]);
    expect(items[0].unitPrice).toBe(16000);
    const mods = items[0].modifiers as Record<string, unknown>[];
    expect(mods).toHaveLength(1);
    expect(mods[0].optionName).toBe('Tocineta');
    expect(mods[0].action).toBe('added');
    expect(mods[0].priceDelta).toBe(2000);
    expect(mods[0].modifierGroup).toBe('ingredients');
    expect(mods[0].replacesOptionId).toBeNull();
    const payment = body.payment as Record<string, unknown>;
    expect(payment.method).toBe('transfer');
    expect(payment.status).toBe('pending');
    expect(payment.amount).toBe(16000);
    expect(payment.payerPhone).toBe('3001234567');
  });

  it('POST delivery + addressId + contactPhone + cash → 201 con snapshot y fee', async () => {
    const addressId = await createAddress();
    const body = await postOrder({
      serviceType: 'delivery',
      items: [{ productId: product.id, quantity: 1, modifiers: [] }],
      addressId,
      contactPhone: '3009876543',
      paymentMethod: 'cash',
      deliveryLocationLink: 'https://maps.google.com/?q=7.09,-71.72',
    });

    expect(body.serviceType).toBe('delivery');
    expect(body.deliveryAddress).toBe(
      'Casa blanca frente a la cancha (Barrio Centro)',
    );
    expect(body.deliveryLocationLink).toBe(
      'https://maps.google.com/?q=7.09,-71.72',
    );
    expect(body.contactPhone).toBe('3009876543');
    expect(body.deliveryFee).toBe(2000);
    expect(body.subtotal).toBe(14000);
    expect(body.total).toBe(16000);
    const payment = body.payment as Record<string, unknown>;
    expect(payment.method).toBe('cash');
    expect(payment.status).toBe('pending');
    expect(payment.payerPhone).toBeNull();
  });

  it('POST delivery + newAddress → 201 snapshot sin dirección guardada', async () => {
    const body = await postOrder({
      serviceType: 'delivery',
      items: [{ productId: product.id, quantity: 1, modifiers: [] }],
      newAddress: { landmark: 'Frente al coliseo', neighborhood: 'La Playa' },
      contactPhone: '3009876543',
      paymentMethod: 'cash',
    });

    expect(body.deliveryAddress).toBe('Frente al coliseo (La Playa)');
    expect(body.total).toBe(16000);
    // El snapshot es texto plano — no hay addressId expuesto.
    expect(body).not.toHaveProperty('addressId');
  });

  it('POST con mismo clientRequestId → 201 con el MISMO id (idempotente)', async () => {
    const clientRequestId = randomUUID();
    const first = await postOrder({ ...pickupTransferBody(), clientRequestId });
    const second = await postOrder({ ...pickupTransferBody(), clientRequestId });

    expect(second.id).toBe(first.id);
    expect(second.orderNumber).toBe(first.orderNumber);
    // Un solo pedido creado en la BD.
    const list = await request(server())
      .get('/orders?bucket=active')
      .set(auth(tokens.accessToken))
      .expect(200);
    expect((list.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('POST combinaciones inválidas → 400', async () => {
    // pickup + cash
    const cashEnPickup = await postOrder(
      { ...pickupTransferBody(), paymentMethod: 'cash' },
      tokens.accessToken,
      400,
    );
    expect(cashEnPickup.errorCode).toBe('INVALID_ORDER_DATA');
    // transfer sin payerPhone
    const sinPayer = pickupTransferBody();
    delete sinPayer.payerPhone;
    await postOrder(sinPayer, tokens.accessToken, 400);
    // delivery sin contactPhone
    await postOrder(
      {
        serviceType: 'delivery',
        items: [{ productId: product.id, quantity: 1, modifiers: [] }],
        newAddress: { landmark: 'Frente al coliseo' },
        paymentMethod: 'cash',
      },
      tokens.accessToken,
      400,
    );
    // pickup con campos de delivery
    await postOrder(
      { ...pickupTransferBody(), deliveryLocationLink: 'https://maps/x' },
      tokens.accessToken,
      400,
    );
    // delivery con ambas direcciones
    await postOrder(
      {
        serviceType: 'delivery',
        items: [{ productId: product.id, quantity: 1, modifiers: [] }],
        addressId: randomUUID(),
        newAddress: { landmark: 'X' },
        contactPhone: '3009876543',
        paymentMethod: 'cash',
      },
      tokens.accessToken,
      400,
    );
  });

  it('POST violaciones de catálogo → 409', async () => {
    // producto agotado
    let res = await request(server())
      .post('/orders')
      .set(auth(tokens.accessToken))
      .send({
        serviceType: 'pickup',
        items: [{ productId: agotado.id, quantity: 1, modifiers: [] }],
        paymentMethod: 'transfer',
        payerPhone: '3001234567',
      })
      .expect(409);
    expect((res.body as { message: string }).message).toContain(
      'Order rejected by catalog',
    );
    expect(res.body.errorCode).toBe('ORDER_CATALOG_VIOLATION');

    // modificador ajeno al producto
    res = await request(server())
      .post('/orders')
      .set(auth(tokens.accessToken))
      .send({
        serviceType: 'pickup',
        items: [
          {
            productId: product.id,
            quantity: 1,
            modifiers: [
              { optionId: '00000000-0000-4000-8000-000000000000', action: 'added' },
            ],
          },
        ],
        paymentMethod: 'transfer',
        payerPhone: '3001234567',
      })
      .expect(409);

    // removed de no-removible (salchicha incluida es el corazón)
    res = await request(server())
      .post('/orders')
      .set(auth(tokens.accessToken))
      .send({
        serviceType: 'pickup',
        items: [
          {
            productId: product.id,
            quantity: 1,
            modifiers: [{ optionId: salchicha.id, action: 'removed' }],
          },
        ],
        paymentMethod: 'transfer',
        payerPhone: '3001234567',
      })
      .expect(409);

    // dos added reclamando el mismo removed → 409 (reemplazo de un
    // solo uso — un removed no financia dos extras gratis)
    const ds = app.get(DataSource);
    const papas = await ds.getRepository(ModifierOption).save({
      groupId: tocineta.groupId,
      name: 'Papas',
      extraPrice: 1500,
      isAvailable: true,
      sortOrder: 3,
    });
    await request(server())
      .post('/orders')
      .set(auth(tokens.accessToken))
      .send({
        serviceType: 'pickup',
        items: [
          {
            productId: product.id,
            quantity: 1,
            modifiers: [
              { optionId: mozzarella.id, action: 'removed' },
              {
                optionId: tocineta.id,
                action: 'added',
                replacesOptionId: mozzarella.id,
              },
              {
                optionId: papas.id,
                action: 'added',
                replacesOptionId: mozzarella.id,
              },
            ],
          },
        ],
        paymentMethod: 'transfer',
        payerPhone: '3001234567',
      })
      .expect(409);

    // producto en categoría inactiva → 409 (un productId cacheado no
    // basta — igual que no aparece en la carta)
    await ds
      .getRepository(Category)
      .update({ slug: 'perros' }, { isActive: false });
    await request(server())
      .post('/orders')
      .set(auth(tokens.accessToken))
      .send(pickupTransferBody())
      .expect(409);
  });

  it('GET /orders: bucket active sin paginar, history con envelope', async () => {
    await postOrder(pickupTransferBody());
    const addressId = await createAddress();
    await postOrder({
      serviceType: 'delivery',
      items: [{ productId: product.id, quantity: 1, modifiers: [] }],
      addressId,
      contactPhone: '3009876543',
      paymentMethod: 'cash',
    });

    const active = await request(server())
      .get('/orders?bucket=active')
      .set(auth(tokens.accessToken))
      .expect(200);
    const activeBody = active.body as {
      items: Record<string, unknown>[];
      total: number;
      page: number;
      limit: number;
    };
    expect(activeBody.items).toHaveLength(2);
    expect(activeBody.total).toBe(2);
    // La card muestra ítems + chip de pago; modifiers no viajan en listado.
    const items0 = activeBody.items[0].items as Record<string, unknown>[];
    expect(items0.length).toBeGreaterThan(0);
    expect(items0[0].modifiers).toEqual([]);
    expect(activeBody.items[0].payment).not.toBeNull();

    // Default (sin ?bucket) = active.
    const def = await request(server())
      .get('/orders')
      .set(auth(tokens.accessToken))
      .expect(200);
    expect((def.body as { items: unknown[] }).items).toHaveLength(2);

    // history vacío → envelope con total 0.
    const history = await request(server())
      .get('/orders?bucket=history')
      .set(auth(tokens.accessToken))
      .expect(200);
    const historyBody = history.body as {
      items: unknown[];
      total: number;
      page: number;
      limit: number;
    };
    expect(historyBody).toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });

  it('GET /orders?bucket=history pagina con envelope {items,total,page,limit}', async () => {
    // Dos pedidos cancelados → history con 2 filas; página 1 de limit=1.
    const ds = app.get(DataSource);
    const o1 = await postOrder(pickupTransferBody());
    await postOrder(pickupTransferBody());
    await request(server())
      .post(`/orders/${o1.id as string}/cancel`)
      .set(auth(tokens.accessToken))
      .send({})
      .expect(201);
    await ds.query(`UPDATE orders SET status = 'done' WHERE id IN (SELECT id FROM orders WHERE status = 'pending')`);

    const res = await request(server())
      .get('/orders?bucket=history&limit=1&page=1')
      .set(auth(tokens.accessToken))
      .expect(200);
    const body = res.body as {
      items: Record<string, unknown>[];
      total: number;
      page: number;
      limit: number;
    };
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(1);
  });

  it('GET /orders/:id mío → 200 con modifiers; de otro usuario → 404', async () => {
    const created = await postOrder(pickupTransferBody());

    const res = await request(server())
      .get(`/orders/${created.id as string}`)
      .set(auth(tokens.accessToken))
      .expect(200);
    const detail = res.body as Record<string, unknown>;
    expect(detail.id).toBe(created.id);
    const items = detail.items as Record<string, unknown>[];
    // El detalle repite los snapshots §016 del POST.
    expect(items[0].productSlug).toBe('el-cachorro');
    expect(items[0].includedNames).toEqual([
      'Queso mozzarella',
      'Salchicha',
    ]);
    const mods = items[0].modifiers as Record<string, unknown>[];
    expect(mods).toHaveLength(1);
    expect(mods[0].optionName).toBe('Tocineta');
    expect(mods[0].modifierGroup).toBe('ingredients');
    expect(mods[0].replacesOptionId).toBeNull();

    // IDOR: orden de otro usuario responde 404 igual que inexistente.
    const emailB = 'orders-b@test.com';
    await registerUser(app, { email: emailB });
    const tokensB = await activateAndGetTokens(app, emailB);
    await request(server())
      .get(`/orders/${created.id as string}`)
      .set(auth(tokensB.accessToken))
      .expect(404);
    await request(server())
      .get(`/orders/${randomUUID()}`)
      .set(auth(tokens.accessToken))
      .expect(404);
  });

  it('POST reemplazo gratis → added delta 0 con replacesOptionId; GET :id lo repite (§016)', async () => {
    const body = await postOrder({
      serviceType: 'pickup',
      items: [
        {
          productId: product.id,
          quantity: 1,
          modifiers: [
            { optionId: mozzarella.id, action: 'removed' },
            {
              optionId: tocineta.id,
              action: 'added',
              replacesOptionId: mozzarella.id,
            },
          ],
        },
      ],
      paymentMethod: 'transfer',
      payerPhone: '3001234567',
    });

    const items = body.items as Record<string, unknown>[];
    expect(items[0].productSlug).toBe('el-cachorro');
    // "Lleva:" efectivo — mozzarella quitada ya no aparece.
    expect(items[0].includedNames).toEqual(['Salchicha']);
    expect(items[0].unitPrice).toBe(14000);
    const mods = items[0].modifiers as Record<string, unknown>[];
    const removed = mods.find((m) => m.action === 'removed')!;
    const added = mods.find((m) => m.action === 'added')!;
    expect(removed.optionId).toBe(mozzarella.id);
    expect(removed.modifierGroup).toBe('ingredients');
    expect(removed.replacesOptionId).toBeNull();
    expect(added.optionId).toBe(tocineta.id);
    expect(added.priceDelta).toBe(0);
    expect(added.modifierGroup).toBe('ingredients');
    // Empareja el par removed→added del cambio gratis.
    expect(added.replacesOptionId).toBe(mozzarella.id);

    // GET :id repite los mismos snapshots.
    const res = await request(server())
      .get(`/orders/${body.id as string}`)
      .set(auth(tokens.accessToken))
      .expect(200);
    const detailItems = (res.body as Record<string, unknown>)
      .items as Record<string, unknown>[];
    expect(detailItems[0].productSlug).toBe('el-cachorro');
    expect(detailItems[0].includedNames).toEqual(['Salchicha']);
    const detailMods = detailItems[0].modifiers as Record<string, unknown>[];
    expect(
      detailMods.find((m) => m.action === 'added')!.replacesOptionId,
    ).toBe(mozzarella.id);
    expect(
      detailMods.find((m) => m.action === 'removed')!.replacesOptionId,
    ).toBeNull();
  });

  it('POST /orders/:id/cancel en pending → cancelled + payment failed; recancel → 409; ajeno → 404', async () => {
    const created = await postOrder(pickupTransferBody());

    const res = await request(server())
      .post(`/orders/${created.id as string}/cancel`)
      .set(auth(tokens.accessToken))
      .send({ reason: 'Me equivoqué de dirección' })
      .expect(201);
    const cancelled = res.body as Record<string, unknown>;
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelReason).toBe('Me equivoqué de dirección');
    const payment = cancelled.payment as Record<string, unknown>;
    expect(payment.status).toBe('failed');

    // Recancelar → 409.
    const again = await request(server())
      .post(`/orders/${created.id as string}/cancel`)
      .set(auth(tokens.accessToken))
      .send({})
      .expect(409);
    expect((again.body as { message: string }).message).toBe(
      'Order can only be cancelled while pending',
    );
    expect(again.body.errorCode).toBe('ORDER_NOT_CANCELLABLE');

    // Cancelar la de otro → 404.
    const emailB = 'orders-c@test.com';
    await registerUser(app, { email: emailB });
    const tokensB = await activateAndGetTokens(app, emailB);
    const ajena = await request(server())
      .post(`/orders/${created.id as string}/cancel`)
      .set(auth(tokensB.accessToken))
      .send({})
      .expect(404);
    expect(ajena.body.errorCode).toBe('ORDER_NOT_FOUND');
    const inexistente = await request(server())
      .post(`/orders/${randomUUID()}/cancel`)
      .set(auth(tokens.accessToken))
      .send({})
      .expect(404);
    expect(inexistente.body.errorCode).toBe('ORDER_NOT_FOUND');
  });

  it('sin token → 401 en los 4 endpoints', async () => {
    await request(server()).get('/orders').expect(401);
    await request(server())
      .post('/orders')
      .send(pickupTransferBody())
      .expect(401);
    await request(server()).get(`/orders/${randomUUID()}`).expect(401);
    await request(server())
      .post(`/orders/${randomUUID()}/cancel`)
      .send({})
      .expect(401);
  });

  it('POST con local cerrado → 409 Store is closed', async () => {
    await cleanStoreTables();
    await seedStoreClosed();
    const res = await request(server())
      .post('/orders')
      .set(auth(tokens.accessToken))
      .send(pickupTransferBody())
      .expect(409);
    expect((res.body as { message: string }).message).toBe('Store is closed');
    expect(res.body.errorCode).toBe('STORE_CLOSED');
  });
});
