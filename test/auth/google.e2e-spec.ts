import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  cleanAuthTables,
  createE2EApp,
  mockGoogleProfile,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('POST /auth/google (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2EApp();
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
  });

  it('crea cuenta nueva y devuelve sesión', async () => {
    mockGoogleProfile({
      googleId: 'g-1',
      email: 'nuevo@gmail.com',
      givenName: 'Ana',
      familyName: 'P',
    });

    const res = await request(app.getHttpServer() as App)
      .post('/auth/google')
      .send({ idToken: 'fake-id-token' })
      .expect(200);

    const body = res.body as {
      accessToken: string;
      refreshToken: string;
      user: { email: string; status: string };
    };
    expect(body.accessToken).toBeTruthy();
    expect(body.user.email).toBe('nuevo@gmail.com');
    expect(body.user.status).toBe('active');

    const ds = app.get(DataSource);
    const rows = await ds.query<
      {
        google_id: string;
        password_hash: string | null;
        referral_code: string;
      }[]
    >(
      `SELECT google_id, password_hash, referral_code FROM users WHERE email = 'nuevo@gmail.com'`,
    );
    expect(rows[0].google_id).toBe('g-1');
    expect(rows[0].password_hash).toBeNull();
    expect(rows[0].referral_code).toBeTruthy();
  });

  it('reutiliza la cuenta por googleId (sin duplicar usuario)', async () => {
    mockGoogleProfile({
      googleId: 'g-1',
      email: 'nuevo@gmail.com',
      givenName: 'Ana',
      familyName: null,
    });
    await request(app.getHttpServer() as App)
      .post('/auth/google')
      .send({ idToken: 'fake-id-token' })
      .expect(200);
    await request(app.getHttpServer() as App)
      .post('/auth/google')
      .send({ idToken: 'fake-id-token' })
      .expect(200);

    const ds = app.get(DataSource);
    const rows = await ds.query<{ c: number }[]>(
      `SELECT COUNT(*)::int AS c FROM users WHERE email = 'nuevo@gmail.com'`,
    );
    expect(rows[0].c).toBe(1);
  });

  it('vincula googleId a cuenta existente por email', async () => {
    await registerUser(app, { email: 'a@b.com' });
    mockGoogleProfile({
      googleId: 'g-link',
      email: 'a@b.com',
      givenName: 'A',
      familyName: null,
    });

    await request(app.getHttpServer() as App)
      .post('/auth/google')
      .send({ idToken: 'fake-id-token' })
      .expect(200);

    const ds = app.get(DataSource);
    const rows = await ds.query<{ google_id: string }[]>(
      `SELECT google_id FROM users WHERE email = 'a@b.com'`,
    );
    expect(rows[0].google_id).toBe('g-link');
  });

  it('rechaza token inválido (spy sin perfil) → 401', async () => {
    mockGoogleProfile(null);
    await request(app.getHttpServer() as App)
      .post('/auth/google')
      .send({ idToken: 'fake-id-token' })
      .expect(401);
  });

  it('rechaza propiedades extra del body → 400', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/google')
      .send({ idToken: 'fake-id-token', role: 'admin' })
      .expect(400);
  });
});
