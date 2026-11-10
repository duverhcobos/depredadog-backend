import bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import dataSource from '../../../../typeorm.config';

// Seed del usuario dueño (role='admin') — DEV solamente.
// Uso: ADMIN_EMAIL=... ADMIN_PASSWORD=... en .env → npm run seed:admin
// Upsert por email (mismo patrón que store.seed.ts — dataSource
// directo, corre fuera de Nest): si el usuario ya existe actualiza
// role/status/email_verified_at pero NO pisa password_hash — un
// cambio manual de contraseña sobrevive al re-seed.
// En producción el admin se crea una vez a mano o via migración
// controlada (pendiente de deploy).

const SALT_ROUNDS = 10;
// Mismo alfabeto/largo que CodeGeneratorService.generateReferralCode.
const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERRAL_LENGTH = 8;

function generateReferralCode(): string {
  let code = '';
  for (let i = 0; i < REFERRAL_LENGTH; i++) {
    code += REFERRAL_ALPHABET[randomInt(0, REFERRAL_ALPHABET.length)];
  }
  return code;
}

async function seed(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'ADMIN_EMAIL y ADMIN_PASSWORD son requeridas en .env (dev-only)',
    );
  }
  await dataSource.initialize();
  const qr = dataSource.createQueryRunner();
  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    // referral_code es NOT NULL + UNIQUE — reintenta ante colisión
    // improbable (mismo criterio que ReferralCodeService: 5 intentos).
    let inserted = false;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      try {
        await qr.query(
          `INSERT INTO "users"
            ("email", "password_hash", "role", "status",
             "email_verified_at", "first_name", "first_last_name",
             "referral_code")
           VALUES ($1, $2, 'admin', 'active', now(), 'Admin',
                   'Depredadog', $3)
           ON CONFLICT ("email") DO UPDATE SET
            "role" = 'admin',
            "status" = 'active',
            "email_verified_at" = COALESCE(
              "users"."email_verified_at", now())`,
          [email, passwordHash, generateReferralCode()],
        );
        inserted = true;
      } catch (e) {
        const code = (e as { code?: string }).code;
        const constraint = (e as { constraint?: string }).constraint;
        if (code === '23505' && constraint === 'uq_users_referral_code') {
          continue; // colisión de referral — otro código y reintenta
        }
        throw e;
      }
    }
    if (!inserted) {
      throw new Error('No se pudo generar un referral_code único');
    }
    console.log(`admin seed OK — ${email} (role=admin, status=active)`);
  } finally {
    await qr.release();
    await dataSource.destroy();
  }
}

seed().catch((e) => {
  console.error('admin seed failed', e);
  process.exit(1);
});
