import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2EApp, restoreThrottler } from './support/e2e-app';

describe('GET /health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2EApp();
  });

  it('devuelve estado de la app y de la BD', async () => {
    const res = await request(app.getHttpServer() as App)
      .get('/health')
      .expect(200);
    const body = res.body as { status: string; db: string };
    expect(body.db).toBe('up');
    expect(body.status).toBe('ok');
    // Evidencia de helmet (main.ts / e2e-app)
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });
});
