import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  activateAndGetTokens,
  cleanAuthTables,
  createE2EApp,
  lastCodeFor,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('POST /auth/check-reset-code (e2e)', () => {
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

  async function requestReset(email: string): Promise<string> {
    await request(app.getHttpServer() as App)
      .post('/auth/forgot-password')
      .send({ email })
      .expect(200);
    return lastCodeFor(email, 'password_reset');
  }

  it('valida un código vigente → 200 con message', async () => {
    await registerUser(app, { email: 'a@b.com' });
    await activateAndGetTokens(app, 'a@b.com');
    const code = await requestReset('a@b.com');

    const res = await request(app.getHttpServer() as App)
      .post('/auth/check-reset-code')
      .send({ email: 'a@b.com', code })
      .expect(200);

    const body = res.body as { message: string };
    expect(body.message).toBeTruthy();
  });

  it('el código sigue vivo tras el chequeo → reset lo consume después', async () => {
    await registerUser(app, { email: 'a@b.com' });
    await activateAndGetTokens(app, 'a@b.com');
    const code = await requestReset('a@b.com');

    await request(app.getHttpServer() as App)
      .post('/auth/check-reset-code')
      .send({ email: 'a@b.com', code })
      .expect(200);
    // La clave del endpoint: el MISMO código todavía sirve para el reset
    await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code, newPassword: 'NuevaPass9' })
      .expect(200);
  });

  it('rechaza código errado → 400', async () => {
    await registerUser(app, { email: 'a@b.com' });
    await activateAndGetTokens(app, 'a@b.com');
    await requestReset('a@b.com');

    await request(app.getHttpServer() as App)
      .post('/auth/check-reset-code')
      .send({ email: 'a@b.com', code: '000000' })
      .expect(400);
  });

  it('rechaza código ya consumido por un reset → 400', async () => {
    await registerUser(app, { email: 'a@b.com' });
    await activateAndGetTokens(app, 'a@b.com');
    const code = await requestReset('a@b.com');

    await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code, newPassword: 'NuevaPass9' })
      .expect(200);
    await request(app.getHttpServer() as App)
      .post('/auth/check-reset-code')
      .send({ email: 'a@b.com', code })
      .expect(400);
  });

  it('rechaza code no-numérico o de largo ≠ 6 → 400 del pipe', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/check-reset-code')
      .send({ email: 'a@b.com', code: 'abcdef' })
      .expect(400);
    await request(app.getHttpServer() as App)
      .post('/auth/check-reset-code')
      .send({ email: 'a@b.com', code: '12345' })
      .expect(400);
  });

  it('email inexistente → 400 con el mismo genérico (no revela)', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/check-reset-code')
      .send({ email: 'nadie@test.com', code: '123456' })
      .expect(400);

    const body = res.body as { message: string };
    expect(body.message).toBe('Invalid or expired code');
  });
});
