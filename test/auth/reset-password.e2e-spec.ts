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

describe('POST /auth/reset-password (e2e)', () => {
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

  it('resetea la contraseña, emite sesión y permite login con la nueva', async () => {
    await registerUser(app, { email: 'a@b.com' });
    await activateAndGetTokens(app, 'a@b.com');
    const code = await requestReset('a@b.com');

    const res = await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code, newPassword: 'NuevaPass9' })
      .expect(200);

    const body = res.body as { accessToken: string; refreshToken: string };
    expect(body.accessToken).toBeTruthy();

    await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email: 'a@b.com', password: 'NuevaPass9' })
      .expect(200);
    await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email: 'a@b.com', password: 'Password1!' })
      .expect(401);
  });

  it('revoca todas las sesiones previas al reset', async () => {
    await registerUser(app, { email: 'a@b.com' });
    const { accessToken } = await activateAndGetTokens(app, 'a@b.com');
    const code = await requestReset('a@b.com');

    await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code, newPassword: 'NuevaPass9' })
      .expect(200);

    // La sesión previa al reset quedó muerta
    await request(app.getHttpServer() as App)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('rechaza código errado → 400', async () => {
    await registerUser(app, { email: 'a@b.com' });
    await activateAndGetTokens(app, 'a@b.com');
    await requestReset('a@b.com');

    await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code: '000000', newPassword: 'NuevaPass9' })
      .expect(400);
  });

  it('rechaza reusar el mismo código → 400', async () => {
    await registerUser(app, { email: 'a@b.com' });
    await activateAndGetTokens(app, 'a@b.com');
    const code = await requestReset('a@b.com');

    await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code, newPassword: 'NuevaPass9' })
      .expect(200);
    await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code, newPassword: 'OtraPass88' })
      .expect(400);
  });

  it('un segundo forgot invalida el código anterior', async () => {
    await registerUser(app, { email: 'a@b.com' });
    await activateAndGetTokens(app, 'a@b.com');
    const first = await requestReset('a@b.com');
    await requestReset('a@b.com'); // emite otro y consume el anterior

    await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code: first, newPassword: 'NuevaPass9' })
      .expect(400);
  });

  it('rechaza password corto → 400', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code: '123456', newPassword: 'short' })
      .expect(400);
  });
});
