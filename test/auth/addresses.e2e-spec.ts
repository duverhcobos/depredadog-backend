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

describe('/addresses (e2e)', () => {
  let app: INestApplication;
  const email = 'addresses@test.com';
  let tokens: { accessToken: string; refreshToken: string };

  function server(): App {
    return app.getHttpServer() as App;
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  const casa = {
    label: 'Casa',
    landmark: 'Casa blanca frente a la cancha',
    neighborhood: 'Barrio Centro',
    type: 'home',
    latitude: 7.09,
    longitude: -71.72,
  };

  async function postAddress(
    body: Record<string, unknown> = casa,
    token = tokens.accessToken,
  ): Promise<Record<string, unknown>> {
    const res = await request(server())
      .post('/addresses')
      .set(auth(token))
      .send(body)
      .expect(201);
    return res.body as Record<string, unknown>;
  }

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

  it('GET vacío devuelve []', async () => {
    const res = await request(server())
      .get('/addresses')
      .set(auth(tokens.accessToken))
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('la primera dirección creada queda isDefault automática', async () => {
    const body = await postAddress();
    expect(body.isDefault).toBe(true);
    expect(body.label).toBe('Casa');
    expect(body.landmark).toBe('Casa blanca frente a la cancha');
    expect(body.neighborhood).toBe('Barrio Centro');
    expect(body.type).toBe('home');
    expect(body.latitude).toBe(7.09);
    expect(body.longitude).toBe(-71.72);
    expect(typeof body.id).toBe('string');
    expect(body).not.toHaveProperty('userId');
  });

  it('la segunda sin flag queda isDefault: false y GET ordena default primero', async () => {
    const first = await postAddress();
    const second = await postAddress({
      ...casa,
      label: 'Trabajo',
      type: 'work',
    });
    expect(second.isDefault).toBe(false);

    const res = await request(server())
      .get('/addresses')
      .set(auth(tokens.accessToken))
      .expect(200);
    const list = res.body as Record<string, unknown>[];
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(first.id);
    expect(list[0].isDefault).toBe(true);
    expect(list[1].id).toBe(second.id);
  });

  it('POST con isDefault: true deja una sola default', async () => {
    await postAddress();
    await postAddress({ ...casa, label: 'Trabajo', type: 'work' });
    const third = await postAddress({
      ...casa,
      label: 'Otra',
      type: 'other',
      isDefault: true,
    });
    expect(third.isDefault).toBe(true);

    const res = await request(server())
      .get('/addresses')
      .set(auth(tokens.accessToken))
      .expect(200);
    const list = res.body as Record<string, unknown>[];
    expect(list).toHaveLength(3);
    expect(list.filter((a) => a.isDefault === true)).toHaveLength(1);
    expect(list[0].id).toBe(third.id);
  });

  it('PATCH actualiza landmark/type parcialmente', async () => {
    const created = await postAddress();
    const res = await request(server())
      .patch(`/addresses/${created.id as string}`)
      .set(auth(tokens.accessToken))
      .send({ landmark: 'Frente al coliseo', type: 'other' })
      .expect(200);
    const body = res.body as Record<string, unknown>;
    expect(body.landmark).toBe('Frente al coliseo');
    expect(body.type).toBe('other');
    expect(body.label).toBe('Casa');
    expect(body.neighborhood).toBe('Barrio Centro');
  });

  it('PATCH con null limpia los campos nullable', async () => {
    const created = await postAddress();
    const res = await request(server())
      .patch(`/addresses/${created.id as string}`)
      .set(auth(tokens.accessToken))
      .send({ neighborhood: null, latitude: null, longitude: null })
      .expect(200);
    const body = res.body as Record<string, unknown>;
    expect(body.neighborhood).toBeNull();
    expect(body.latitude).toBeNull();
    expect(body.longitude).toBeNull();
  });

  it('PATCH isDefault: true en otra dirección mantiene exclusividad', async () => {
    const first = await postAddress();
    const second = await postAddress({ ...casa, label: 'Trabajo' });
    await request(server())
      .patch(`/addresses/${second.id as string}`)
      .set(auth(tokens.accessToken))
      .send({ isDefault: true })
      .expect(200);

    const res = await request(server())
      .get('/addresses')
      .set(auth(tokens.accessToken))
      .expect(200);
    const list = res.body as Record<string, unknown>[];
    expect(list.filter((a) => a.isDefault === true)).toHaveLength(1);
    expect(list[0].id).toBe(second.id);
    const reloadedFirst = list.find((a) => a.id === first.id);
    expect(reloadedFirst?.isDefault).toBe(false);
  });

  it('DELETE no-default → 204; DELETE default → la más antigua hereda', async () => {
    const first = await postAddress();
    const second = await postAddress({ ...casa, label: 'Trabajo' });
    const third = await postAddress({ ...casa, label: 'Otra' });

    await request(server())
      .delete(`/addresses/${second.id as string}`)
      .set(auth(tokens.accessToken))
      .expect(204);

    await request(server())
      .delete(`/addresses/${first.id as string}`)
      .set(auth(tokens.accessToken))
      .expect(204);

    const res = await request(server())
      .get('/addresses')
      .set(auth(tokens.accessToken))
      .expect(200);
    const list = res.body as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(third.id);
    expect(list[0].isDefault).toBe(true);
  });

  it('IDOR: PATCH/DELETE de dirección ajena → 404', async () => {
    const ajena = await postAddress();

    const emailB = 'addresses-b@test.com';
    await registerUser(app, { email: emailB });
    const tokensB = await activateAndGetTokens(app, emailB);

    await request(server())
      .patch(`/addresses/${ajena.id as string}`)
      .set(auth(tokensB.accessToken))
      .send({ landmark: 'Hackeo' })
      .expect(404);

    await request(server())
      .delete(`/addresses/${ajena.id as string}`)
      .set(auth(tokensB.accessToken))
      .expect(404);

    // La dirección de A sigue intacta
    const res = await request(server())
      .get('/addresses')
      .set(auth(tokens.accessToken))
      .expect(200);
    expect(res.body).toHaveLength(1);
  });

  it('PATCH/DELETE de uuid inexistente → 404', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    await request(server())
      .patch(`/addresses/${id}`)
      .set(auth(tokens.accessToken))
      .send({ landmark: 'X' })
      .expect(404);
    await request(server())
      .delete(`/addresses/${id}`)
      .set(auth(tokens.accessToken))
      .expect(404);
  });

  it('la 11ª dirección responde 409', async () => {
    for (let i = 0; i < 10; i++) {
      await postAddress({ ...casa, label: `Dir ${i}` });
    }
    const res = await request(server())
      .post('/addresses')
      .set(auth(tokens.accessToken))
      .send(casa)
      .expect(409);
    const body = res.body as Record<string, unknown>;
    expect(body.message).toBe('Address limit reached (10 per user)');
  });

  it('validaciones: sin landmark/type, enum inválido, latitud fuera de rango, campo extra → 400', async () => {
    const sinLandmark: Record<string, unknown> = { ...casa };
    delete sinLandmark.landmark;
    await request(server())
      .post('/addresses')
      .set(auth(tokens.accessToken))
      .send(sinLandmark)
      .expect(400);

    const sinType: Record<string, unknown> = { ...casa };
    delete sinType.type;
    await request(server())
      .post('/addresses')
      .set(auth(tokens.accessToken))
      .send(sinType)
      .expect(400);

    await request(server())
      .post('/addresses')
      .set(auth(tokens.accessToken))
      .send({ ...casa, type: 'oficina' })
      .expect(400);

    await request(server())
      .post('/addresses')
      .set(auth(tokens.accessToken))
      .send({ ...casa, latitude: 200 })
      .expect(400);

    await request(server())
      .post('/addresses')
      .set(auth(tokens.accessToken))
      .send({ ...casa, landmark: '   ' })
      .expect(400);

    await request(server())
      .post('/addresses')
      .set(auth(tokens.accessToken))
      .send({ ...casa, foo: 'bar' })
      .expect(400);
  });

  it('PATCH con null en campos no-nullable → 400 (no 500)', async () => {
    const dir = await postAddress();
    for (const bad of [
      { label: null },
      { landmark: null },
      { type: null },
      { isDefault: null },
    ]) {
      await request(server())
        .patch(`/addresses/${dir.id as string}`)
        .set(auth(tokens.accessToken))
        .send(bad)
        .expect(400);
    }
  });

  it('PATCH con label/landmark de solo espacios → 400', async () => {
    const dir = await postAddress();
    for (const bad of [{ label: '   ' }, { landmark: '  ' }]) {
      await request(server())
        .patch(`/addresses/${dir.id as string}`)
        .set(auth(tokens.accessToken))
        .send(bad)
        .expect(400);
    }
  });

  it(':id no-UUID → 400 en PATCH y DELETE', async () => {
    await request(server())
      .patch('/addresses/no-es-uuid')
      .set(auth(tokens.accessToken))
      .send({ landmark: 'X' })
      .expect(400);
    await request(server())
      .delete('/addresses/no-es-uuid')
      .set(auth(tokens.accessToken))
      .expect(400);
  });

  it('PATCH isDefault:false sobre la única default la deja sin default', async () => {
    const dir = await postAddress();
    const res = await request(server())
      .patch(`/addresses/${dir.id as string}`)
      .set(auth(tokens.accessToken))
      .send({ isDefault: false })
      .expect(200);
    expect((res.body as Record<string, unknown>).isDefault).toBe(false);
    const list = await request(server())
      .get('/addresses')
      .set(auth(tokens.accessToken))
      .expect(200);
    const rows = list.body as { isDefault: boolean }[];
    expect(rows.every((r) => !r.isDefault)).toBe(true);
  });

  it('sin token → 401 en los 4 endpoints', async () => {
    await request(server()).get('/addresses').expect(401);
    await request(server()).post('/addresses').send(casa).expect(401);
    await request(server())
      .patch('/addresses/00000000-0000-4000-8000-000000000000')
      .send({ landmark: 'X' })
      .expect(401);
    await request(server())
      .delete('/addresses/00000000-0000-4000-8000-000000000000')
      .expect(401);
  });
});
