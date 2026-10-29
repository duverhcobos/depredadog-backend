import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  cleanAuthTables,
  createE2EApp,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('POST /auth/register (e2e)', () => {
  let app: INestApplication;

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

  it('registra un usuario pendiente de verificación', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({
        email: 'Nuevo@Test.com',
        password: 'Password1!',
        firstName: 'Nuevo',
        secondName: 'Carlos',
        firstLastName: 'Cliente',
        secondLastName: 'Feliz',
      })
      .expect(201);

    const body = res.body as Record<string, unknown>;
    expect(body.email).toBe('nuevo@test.com');
    expect(body.firstName).toBe('Nuevo');
    expect(body.secondName).toBe('Carlos');
    expect(body.firstLastName).toBe('Cliente');
    expect(body.secondLastName).toBe('Feliz');
    expect(body.status).toBe('pending_verification');
    expect(body.role).toBe('customer');
    expect(typeof body.referralCode).toBe('string');
    expect((body.referralCode as string).length).toBe(8);
    expect(body.accessToken).toBeUndefined();
    expect(body.passwordHash).toBeUndefined();
  });

  it('rechaza email inválido', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({
        email: 'no-es-email',
        password: 'Password1!',
        firstName: 'X',
        firstLastName: 'Y',
      })
      .expect(400);
  });

  it('rechaza password corto', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({
        email: 'a@b.com',
        password: 'short',
        firstName: 'X',
        firstLastName: 'Y',
      })
      .expect(400);
  });

  it('rechaza sin firstLastName (obligatorio)', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({
        email: 'a@b.com',
        password: 'Password1!',
        firstName: 'X',
      })
      .expect(400);
  });

  it('rechaza campos no permitidos (mass-assignment role)', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({
        email: 'a@b.com',
        password: 'Password1!',
        firstName: 'X',
        firstLastName: 'Y',
        role: 'admin',
      })
      .expect(400);
    expect((res.body as { message: string[] }).message.join()).toContain(
      'role',
    );
  });

  it('rechaza email duplicado aunque cambie el case', async () => {
    await registerUser(app, { email: 'dupe@test.com' });
    const res = await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({
        email: 'DUPE@test.com',
        password: 'Password1!',
        firstName: 'Otro',
        firstLastName: 'Cliente',
      })
      .expect(409);
    expect((res.body as { message: string }).message).toBe(
      'Email is already registered',
    );
  });

  it('rechaza referralCode inexistente', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({
        email: 'a@b.com',
        password: 'Password1!',
        firstName: 'X',
        firstLastName: 'Y',
        referralCode: 'NOEXISTE1',
      })
      .expect(400);
  });

  it('guarda referred_by cuando el código es válido', async () => {
    await registerUser(app, { email: 'ref@test.com' });
    const referrer = (
      await app
        .get(DataSource)
        .query<{ id: string; referral_code: string }[]>(
          'SELECT id, referral_code FROM users WHERE email = $1',
          ['ref@test.com'],
        )
    )[0];

    await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({
        email: 'ref2@test.com',
        password: 'Password1!',
        firstName: 'Y',
        firstLastName: 'Z',
        referralCode: referrer.referral_code,
      })
      .expect(201);

    const rows = await app
      .get(DataSource)
      .query<{ referred_by: string }[]>(
        'SELECT referred_by FROM users WHERE email = $1',
        ['ref2@test.com'],
      );
    expect(rows[0].referred_by).toBe(referrer.id);
  });
});
