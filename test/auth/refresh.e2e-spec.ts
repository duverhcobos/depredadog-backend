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

describe('POST /auth/refresh (e2e)', () => {
  let app: INestApplication;
  const email = 'refresh@test.com';

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
    await registerUser(app, { email });
    await activateAndGetTokens(app, email);
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  async function login(): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email, password: 'Password1!' })
      .expect(200);
    return res.body as { accessToken: string; refreshToken: string };
  }

  it('rota el refresh token y emite un access nuevo', async () => {
    const { refreshToken } = await login();
    const res = await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    const body = res.body as { accessToken: string; refreshToken: string };
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.refreshToken).not.toBe(refreshToken);

    // El token rotado ya no sirve
    await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('reuso de token revocado revoca todas las sesiones', async () => {
    const first = await login();
    const second = await login();

    // Rotar la primera sesión → first.refreshToken queda revocado
    const rotated = await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);

    // Reuso del revocado → sesión comprometida → revoca todo
    await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);

    // La segunda sesión también murió
    await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken: second.refreshToken })
      .expect(401);

    // Y el token recién rotado también
    const rotatedBody = rotated.body as { refreshToken: string };
    await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken: rotatedBody.refreshToken })
      .expect(401);
  });

  it('rechaza token inexistente', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken: 'token-inventado' })
      .expect(401);
  });

  it('rechaza body sin refreshToken', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({})
      .expect(400);
  });
});
