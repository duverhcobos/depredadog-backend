import dataSource from '../../../../typeorm.config';

// Seed del DUEÑO — admin vinculado a Google, sin password_hash.
// El flujo /auth/google encuentra por email, vincula googleId y NUNCA
// toca el role (google-login.use-case) → entra directo como admin en
// su primer login. status 'active' salta la verificación por email
// (Google ya probó el correo).
// Idempotente por email. Uso: npm run seed:owner

const OWNER_ID = '50a11000-0000-4000-8000-000000000001';

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    await dataSource.manager.query(
      `INSERT INTO "users"
        ("id", "email", "role", "status", "email_verified_at",
         "first_name", "first_last_name", "referral_code")
       VALUES ($1, 'duverhernandezcobos@gmail.com', 'admin', 'active', now(),
               'Duver', 'Hernandez', 'DUVER-DOG')
       ON CONFLICT ("email") DO NOTHING`,
      [OWNER_ID],
    );
    console.log('owner seed applied');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
