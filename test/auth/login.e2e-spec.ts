import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  activateAndGetTokens,
  cleanAuthTables,
  createE2EApp,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('POST /auth/login (e2e)', () => {
  let app: INestApplication;
  const email = 'login@test.com';
  const password = 'Password1!';

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('devuelve tokens y perfil con credenciales válidas', async () => {
    await registerUser(app, { email, password });
    await activateAndGetTokens(app, email);

    const res = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    const body = res.body as {
      accessToken: string;
      refreshToken: string;
      user: { email: string; status: string };
    };
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.email).toBe(email);
    expect(body.user.status).toBe('active');
  });

  it('mismo 401 para password errado y email inexistente', async () => {
    await registerUser(app, { email, password });
    await activateAndGetTokens(app, email);

    const wrongPass = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email, password: 'WrongPass1' })
      .expect(401);
    const unknownEmail = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email: 'ghost@test.com', password })
      .expect(401);

    expect((wrongPass.body as { message: string }).message).toBe(
      'Invalid credentials',
    );
    expect((unknownEmail.body as { message: string }).message).toBe(
      'Invalid credentials',
    );
    expect(wrongPass.body.errorCode).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.errorCode).toBe('INVALID_CREDENTIALS');
  });

  it('rechaza login sin email verificado', async () => {
    await registerUser(app, { email, password });
    const res = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email, password })
      .expect(403);
    expect((res.body as { message: string }).message).toBe(
      'Email is not verified',
    );
  });

  it('registra el dispositivo cuando llega fingerprint', async () => {
    await registerUser(app, { email, password });
    await activateAndGetTokens(app, email);

    await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({
        email,
        password,
        deviceFingerprint: 'fp-android-1',
        platform: 'android',
      })
      .expect(200);

    const devices = await app
      .get(DataSource)
      .query<{ fingerprint: string; platform: string }[]>(
        'SELECT fingerprint, platform FROM devices',
      );
    expect(devices).toHaveLength(1);
    expect(devices[0].fingerprint).toBe('fp-android-1');
    expect(devices[0].platform).toBe('android');
  });
});
