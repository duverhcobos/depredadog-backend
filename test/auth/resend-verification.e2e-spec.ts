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

const GENERIC_MESSAGE =
  'If that email is registered and unverified, a new code has been sent.';

describe('POST /auth/resend-verification (e2e)', () => {
  let app: INestApplication;
  const email = 'resend@test.com';

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

  it('emite un código nuevo e invalida el anterior', async () => {
    const firstCode = lastCodeFor(email);
    const res = await request(app.getHttpServer() as App)
      .post('/auth/resend-verification')
      .send({ email })
      .expect(200);
    expect((res.body as { message: string }).message).toBe(GENERIC_MESSAGE);

    const secondCode = lastCodeFor(email);
    expect(secondCode).not.toBe(firstCode);

    await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code: firstCode })
      .expect(400);
    await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code: secondCode })
      .expect(200);
  });

  it('responde lo mismo para email inexistente (anti-enumeración)', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/resend-verification')
      .send({ email: 'ghost@test.com' })
      .expect(200);
    expect((res.body as { message: string }).message).toBe(GENERIC_MESSAGE);
  });

  it('responde lo mismo para un usuario ya verificado', async () => {
    await activateAndGetTokens(app, email);
    const res = await request(app.getHttpServer() as App)
      .post('/auth/resend-verification')
      .send({ email })
      .expect(200);
    expect((res.body as { message: string }).message).toBe(GENERIC_MESSAGE);
  });
});
