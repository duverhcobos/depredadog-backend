import dataSource from '../../../../typeorm.config';

// Seed de desarrollo de la tienda — idempotente.
// Uso: npm run seed:store
// Horario real del dueño (2026-11-20): TODOS los días 18:00–22:00
// hora Colombia. 0=domingo … 6=sábado.

const SETTINGS_ID = '5e11c000-0000-4000-8000-000000000001';
const bh = (n: number): string =>
  `5e11c000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const tb = (n: number): string =>
  `5e11d000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

interface HourSeed {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

// Lunes a domingo 6:00pm–10:00pm hora Colombia — todos los días abre.
const hours: HourSeed[] = [
  { dayOfWeek: 0, opensAt: '18:00', closesAt: '22:00', isClosed: false },
  { dayOfWeek: 1, opensAt: '18:00', closesAt: '22:00', isClosed: false },
  { dayOfWeek: 2, opensAt: '18:00', closesAt: '22:00', isClosed: false },
  { dayOfWeek: 3, opensAt: '18:00', closesAt: '22:00', isClosed: false },
  { dayOfWeek: 4, opensAt: '18:00', closesAt: '22:00', isClosed: false },
  { dayOfWeek: 5, opensAt: '18:00', closesAt: '22:00', isClosed: false },
  { dayOfWeek: 6, opensAt: '18:00', closesAt: '22:00', isClosed: false },
];

const tables = ['Mesa 1', 'Mesa 2'];

async function seed(): Promise<void> {
  await dataSource.initialize();
  const qr = dataSource.createQueryRunner();
  try {
    await qr.query(
      `INSERT INTO "store_settings"
        ("id", "name", "phone", "address", "delivery_fee", "min_delivery_order")
       VALUES ($1, 'Depredadog', NULL, $2, 2000, 10000)
       ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name",
        "address" = EXCLUDED."address",
        "delivery_fee" = EXCLUDED."delivery_fee",
        "min_delivery_order" = EXCLUDED."min_delivery_order"`,
      [SETTINGS_ID, 'Cl. 7ª, Pueblo Nuevo, Arauquita, Arauca'],
    );

    for (const [i, h] of hours.entries()) {
      await qr.query(
        `INSERT INTO "business_hours"
          ("id", "day_of_week", "opens_at", "closes_at", "is_closed")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("day_of_week") DO UPDATE SET
          "opens_at" = EXCLUDED."opens_at",
          "closes_at" = EXCLUDED."closes_at",
          "is_closed" = EXCLUDED."is_closed"`,
        [bh(i + 1), h.dayOfWeek, h.opensAt, h.closesAt, h.isClosed],
      );
    }

    for (const [i, label] of tables.entries()) {
      await qr.query(
        `INSERT INTO "tables" ("id", "label") VALUES ($1, $2)
         ON CONFLICT ("label") DO NOTHING`,
        [tb(i + 1), label],
      );
    }

    const [{ c: settings }] = (await qr.query(
      `SELECT count(*)::int AS c FROM "store_settings"`,
    )) as { c: number }[];
    const [{ c: hcount }] = (await qr.query(
      `SELECT count(*)::int AS c FROM "business_hours"`,
    )) as { c: number }[];
    const [{ c: tcount }] = (await qr.query(
      `SELECT count(*)::int AS c FROM "tables"`,
    )) as { c: number }[];
    console.log(
      `store seed OK — settings:${settings} horas:${hcount} mesas:${tcount}`,
    );
  } finally {
    await qr.release();
    await dataSource.destroy();
  }
}

seed().catch((e) => {
  console.error('store seed failed', e);
  process.exit(1);
});
