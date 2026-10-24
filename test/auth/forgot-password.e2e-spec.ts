import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  cleanAuthTables,
  createE2EApp,
  lastCodeFor,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('POST /auth/forgot-password (e2e)', () => {
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

  it('devuelve 200 genérico y emite código si el email existe', async () => {
    await registerUser(app, { email: 'a@b.com' });

    const res = await request(app.getHttpServer() as App)
      .post('/auth/forgot-password')
      .send({ email: 'a@b.com' })
      .expect(200);

    expect((res.body as { message: string }).message).toContain('reset code');
    expect(lastCodeFor('a@b.com', 'password_reset')).toMatch(/^\d{6}$/);
  });

  it('mismo 200 si el email no existe (anti-enumeración)', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/forgot-password')
      .send({ email: 'ghost@b.com' })
      .expect(200);

    expect((res.body as { message: string }).message).toContain('reset code');
  });

  it('rechaza email malformado → 400', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/forgot-password')
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  it('rechaza propiedades extra del body → 400', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/forgot-password')
      .send({ email: 'a@b.com', userId: 'x' })
      .expect(400);
  });
});
