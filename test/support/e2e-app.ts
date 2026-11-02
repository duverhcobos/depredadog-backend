import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import helmet from 'helmet';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { EmailSenderService } from '../../src/modules/auth/infrastructure/services/email-sender.service';
import { GoogleTokenVerifierService } from '../../src/modules/auth/infrastructure/services/google-token-verifier.service';
import { GoogleProfile } from '../../src/modules/auth/domain/services/google-token-verifier.interface';
import { InvalidGoogleTokenException } from '../../src/modules/auth/domain/exceptions/invalid-google-token.exception';

let throttlerGuardSpy: jest.SpyInstance;

export type SentEmailKind = 'verification' | 'password_reset';

const sentEmails: { kind: SentEmailKind; email: string; code: string }[] = [];

let googleProfile: GoogleProfile | null = null;

/** Configura lo que el spy de Google devuelve en el siguiente /auth/google */
export function mockGoogleProfile(profile: GoogleProfile | null): void {
  googleProfile = profile;
}

export async function createE2EApp(): Promise<INestApplication> {
  jest.restoreAllMocks();
  throttlerGuardSpy = jest
    .spyOn(ThrottlerGuard.prototype, 'canActivate')
    .mockResolvedValue(true);
  jest
    .spyOn(EmailSenderService.prototype, 'sendVerificationCode')
    .mockImplementation((email: string, code: string) => {
      sentEmails.push({ kind: 'verification', email, code });
      return Promise.resolve();
    });
  jest
    .spyOn(EmailSenderService.prototype, 'sendPasswordResetCode')
    .mockImplementation((email: string, code: string) => {
      sentEmails.push({ kind: 'password_reset', email, code });
      return Promise.resolve();
    });
  jest
    .spyOn(GoogleTokenVerifierService.prototype, 'verify')
    .mockImplementation(() => {
      if (!googleProfile) {
        return Promise.reject(new InvalidGoogleTokenException());
      }
      return Promise.resolve(googleProfile);
    });

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  // helmet vive en main.ts — los e2e no pasan por ahí, se aplica acá
  app.use(helmet());

  // El pipe global vive en main.ts — los e2e no pasan por ahí, se aplica acá
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  return app;
}

export function restoreThrottler(): void {
  throttlerGuardSpy?.mockRestore();
}

export function lastCodeFor(
  email: string,
  kind: SentEmailKind = 'verification',
): string {
  const found = [...sentEmails]
    .reverse()
    .find((e) => e.email === email && e.kind === kind);
  if (!found) throw new Error(`No ${kind} email captured for ${email}`);
  return found.code;
}

export async function cleanAuthTables(app: INestApplication): Promise<void> {
  const ds = app.get(DataSource);
  await ds.query(
    'TRUNCATE refresh_tokens, auth_tokens, devices, addresses, users RESTART IDENTITY CASCADE',
  );
  sentEmails.length = 0;
  googleProfile = null;
}

export interface RegisterBody {
  email: string;
  password: string;
  firstName: string;
  secondName?: string;
  firstLastName: string;
  secondLastName?: string;
  phone?: string;
  referralCode?: string;
  marketingOptIn?: boolean;
  deviceFingerprint?: string;
  platform?: string;
}

export async function registerUser(
  app: INestApplication,
  overrides: Partial<RegisterBody> = {},
): Promise<RegisterBody> {
  const body: RegisterBody = {
    email: 'user@test.com',
    password: 'Password1!',
    firstName: 'Test',
    firstLastName: 'User',
    ...overrides,
  };
  await request(app.getHttpServer() as App)
    .post('/auth/register')
    .send(body)
    .expect(201);
  return body;
}

export async function activateAndGetTokens(
  app: INestApplication,
  email: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const code = lastCodeFor(email);
  const res = await request(app.getHttpServer() as App)
    .post('/auth/verify-email')
    .send({ email, code })
    .expect(200);
  return res.body as { accessToken: string; refreshToken: string };
}
