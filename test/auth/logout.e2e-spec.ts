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

describe('POST /auth/logout (e2e)', () => {
  let app: INestApplication;
  const email = 'logout@test.com';
  let tokens: { accessToken: string; refreshToken: string };

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
    await registerUser(app, { email });
    tokens = await activateAndGetTokens(app, email);
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('revoca la sesión: /me y /refresh dejan de funcionar', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(204);

    await request(app.getHttpServer() as App)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(401);

    await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
  });

  it('rechaza logout sin token', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/logout')
      .expect(401);
  });
});
