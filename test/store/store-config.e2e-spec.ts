import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { BusinessHour } from '../../src/modules/store/domain/entities/business-hour.entity';
import { StoreSettings } from '../../src/modules/store/domain/entities/store-settings.entity';
import {
  activateAndGetTokens,
  cleanAuthTables,
  createE2EApp,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('GET /store/config (e2e)', () => {
  let app: INestApplication;
  const email = 'store@test.com';
  let tokens: { accessToken: string; refreshToken: string };

  async function cleanStoreTables(): Promise<void> {
    const ds = app.get(DataSource);
    await ds.query(
      'TRUNCATE store_settings, business_hours, tables RESTART IDENTITY CASCADE',
    );
  }

  // Semana siempre-abierta (00:00→00:00, 24h, los 7 días): isOpen y today son
  // deterministas sin importar la hora en que corra el spec.
  async function seedStore(): Promise<void> {
    const ds = app.get(DataSource);
    await ds.getRepository(StoreSettings).save({
      name: 'Depredadog',
      address: 'Cl. 7ª, Pueblo Nuevo, Arauquita, Arauca',
      deliveryFee: 2000,
      minDeliveryOrder: 10000,
    });
    await ds.getRepository(BusinessHour).save(
      [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        dayOfWeek: d,
        // 00:00→00:00 = rango cruzado 24h — siempre abierto, determinista
        // (23:59 dejaba un minuto de flake al cierre del día).
        opensAt: '00:00',
        closesAt: '00:00',
        isClosed: false,
      })),
    );
  }

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanStoreTables();
    await cleanAuthTables(app);
    await registerUser(app, { email });
    tokens = await activateAndGetTokens(app, email);
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('rechaza sin token (401)', async () => {
    await request(app.getHttpServer() as App)
      .get('/store/config')
      .expect(401);
  });

  it('sin fila de store_settings → 404 store not configured', async () => {
    const res = await request(app.getHttpServer() as App)
      .get('/store/config')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(404);

    const body = res.body as { statusCode: number; message: string };
    expect(body.message).toBe('Store is not configured');
  });

  it('devuelve la config con isOpen derivado, today y las 7 filas semanales', async () => {
    await seedStore();

    const res = await request(app.getHttpServer() as App)
      .get('/store/config')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);

    const body = res.body as {
      name: string;
      phone: string | null;
      address: string | null;
      logoUrl: string | null;
      deliveryFee: number;
      minDeliveryOrder: number | null;
      isOpen: boolean;
      today: {
        dayOfWeek: number;
        opensAt: string;
        closesAt: string;
        isClosed: boolean;
      } | null;
      weeklyHours: {
        dayOfWeek: number;
        opensAt: string;
        closesAt: string;
        isClosed: boolean;
      }[];
    };

    expect(body.name).toBe('Depredadog');
    expect(body.phone).toBeNull();
    expect(body.address).toBe('Cl. 7ª, Pueblo Nuevo, Arauquita, Arauca');
    expect(body.logoUrl).toBeNull();
    expect(body.deliveryFee).toBe(2000);
    expect(body.minDeliveryOrder).toBe(10000);

    // 00:00→00:00 (rango cruzado 24h) todos los días → abierto siempre.
    expect(body.isOpen).toBe(true);

    // Día de hoy en la tz del negocio (America/Bogota, de .env.test).
    const expectedDay = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }),
    ).getDay();
    expect(body.today).not.toBeNull();
    expect(body.today!.dayOfWeek).toBe(expectedDay);
    // El contrato expone 'HH:MM' (el time de PG se recorta).
    expect(body.today!.opensAt).toBe('00:00');
    expect(body.today!.closesAt).toBe('00:00');
    expect(body.today!.isClosed).toBe(false);

    expect(body.weeklyHours).toHaveLength(7);
    expect(body.weeklyHours.map((h) => h.dayOfWeek)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    for (const h of body.weeklyHours) {
      expect(h.opensAt).toBe('00:00');
      expect(h.closesAt).toBe('00:00');
      expect(h.isClosed).toBe(false);
    }
  });

  it('día cerrado llega con isClosed=true en weeklyHours', async () => {
    const ds = app.get(DataSource);
    await ds.getRepository(StoreSettings).save({ name: 'Depredadog' });
    await ds.getRepository(BusinessHour).save(
      [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        dayOfWeek: d,
        opensAt: '00:00',
        closesAt: d === 1 ? '00:00' : '23:59',
        isClosed: d === 1,
      })),
    );

    const res = await request(app.getHttpServer() as App)
      .get('/store/config')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);

    const body = res.body as {
      weeklyHours: { dayOfWeek: number; isClosed: boolean }[];
    };
    const monday = body.weeklyHours.find((h) => h.dayOfWeek === 1);
    expect(monday?.isClosed).toBe(true);
  });
});
