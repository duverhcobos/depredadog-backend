import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  activateAndGetTokens,
  cleanAuthTables,
  createE2EApp,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('GET /auth/me (e2e)', () => {
  let app: INestApplication;
  const email = 'me@test.com';
  let tokens: { accessToken: string; refreshToken: string };

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
    await registerUser(app, {
      email,
      firstName: 'Ana',
      firstLastName: 'López',
    });
    tokens = await activateAndGetTokens(app, email);
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('devuelve el perfil del usuario autenticado', async () => {
    const res = await request(app.getHttpServer() as App)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body.email).toBe(email);
    expect(body.firstName).toBe('Ana');
    expect(body.secondName).toBeNull();
    expect(body.firstLastName).toBe('López');
    expect(body.secondLastName).toBeNull();
    expect(body.status).toBe('active');
    expect(typeof body.referralCode).toBe('string');
    expect(body.passwordHash).toBeUndefined();
  });

  it('rechaza sin token', async () => {
    await request(app.getHttpServer() as App)
      .get('/auth/me')
      .expect(401);
  });

  it('rechaza token inválido', async () => {
    await request(app.getHttpServer() as App)
      .get('/auth/me')
      .set('Authorization', 'Bearer token-inventado')
      .expect(401);
  });

  it('rechaza después de logout (sesión muerta)', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(204);

    await request(app.getHttpServer() as App)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(401);
  });
});
