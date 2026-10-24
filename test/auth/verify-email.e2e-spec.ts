import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  cleanAuthTables,
  createE2EApp,
  lastCodeFor,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('POST /auth/verify-email (e2e)', () => {
  let app: INestApplication;
  const email = 'verify@test.com';

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
    await registerUser(app, { email });
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('verifica el email y devuelve sesión completa', async () => {
    const code = lastCodeFor(email);
    const res = await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code })
      .expect(200);

    const body = res.body as {
      accessToken: string;
      refreshToken: string;
      user: { status: string; emailVerifiedAt: string | null };
    };
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.status).toBe('active');
    expect(body.user.emailVerifiedAt).toBeTruthy();
  });

  it('el código queda consumido (single-use)', async () => {
    const code = lastCodeFor(email);
    await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code })
      .expect(200);
    await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code })
      .expect(400);
  });

  it('rechaza código incorrecto', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code: '000000' })
      .expect(400);
    expect((res.body as { message: string }).message).toBe(
      'Invalid or expired code',
    );
  });

  it('rechaza el código de otro usuario', async () => {
    await registerUser(app, { email: 'other@test.com' });
    const codeOfOther = lastCodeFor('other@test.com');
    await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code: codeOfOther })
      .expect(400);
  });

  it('rechaza email inexistente con el mismo mensaje', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email: 'ghost@test.com', code: '123456' })
      .expect(400);
    expect((res.body as { message: string }).message).toBe(
      'Invalid or expired code',
    );
  });

  it('rechaza código expirado', async () => {
    const code = lastCodeFor(email);
    await app
      .get(DataSource)
      .query(`UPDATE auth_tokens SET expires_at = now() - interval '1 minute'`);
    await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code })
      .expect(400);
  });

  it('rechaza formato de código inválido', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code: 'abcdef' })
      .expect(400);
  });
});
