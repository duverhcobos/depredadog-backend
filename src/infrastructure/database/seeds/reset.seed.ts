import dataSource from '../../../../typeorm.config';
import { seedCatalogData } from './catalog.seed';
import { seedPromotionsData } from './promotions.seed';

// Reset de base de datos (propuesta 025): wipe de TODAS las tablas de
// negocio + re-seed de lo real — menú (vía seedCatalogData), store_settings
// y business_hours. La tabla "migrations" sobrevive (es contabilidad del
// esquema, no data).
//
// Uso: RESET_CONFIRM=yes npm run seed:reset
// La guarda evita un wipe accidental apuntando a la DB equivocada — sin
// RESET_CONFIRM=yes aborta antes de tocar nada.

const SETTINGS_ID = '5e11c000-0000-4000-8000-000000000001';
const bh = (n: number): string =>
  `5e11c000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

// Placeholder del seed de tienda — confirmar horario real con el dueño.
// 0=domingo … 6=sábado. Lunes cerrado.
const businessHours = [
  { dayOfWeek: 0, opensAt: '16:00', closesAt: '23:00', isClosed: false },
  { dayOfWeek: 1, opensAt: '00:00', closesAt: '00:00', isClosed: true },
  { dayOfWeek: 2, opensAt: '17:00', closesAt: '23:00', isClosed: false },
  { dayOfWeek: 3, opensAt: '17:00', closesAt: '23:00', isClosed: false },
  { dayOfWeek: 4, opensAt: '17:00', closesAt: '23:00', isClosed: false },
  { dayOfWeek: 5, opensAt: '17:00', closesAt: '23:00', isClosed: false },
  { dayOfWeek: 6, opensAt: '17:00', closesAt: '23:00', isClosed: false },
];

// Orden irrelevante gracias a CASCADE; se lista todo explícito para que el
// wipe sea auditable. "migrations" NO está — es el historial del esquema.
const BUSINESS_TABLES = [
  'payments',
  'promotions',
  'order_item_modifiers',
  'order_items',
  'orders',
  'day_closes',
  'product_modifier_options',
  'product_modifier_groups',
  'combo_items',
  'product_images',
  'modifier_options',
  'modifier_groups',
  'products',
  'categories',
  'tables',
  'business_hours',
  'store_settings',
  'addresses',
  'devices',
  'auth_tokens',
  'refresh_tokens',
  'users',
];

async function main(): Promise<void> {
  if (process.env.RESET_CONFIRM !== 'yes') {
    console.error(
      'Reset destructivo — confirma explícito con RESET_CONFIRM=yes',
    );
    process.exit(1);
  }

  await dataSource.initialize();
  try {
    await dataSource.manager.transaction(async (manager) => {
      await manager.query(
        `TRUNCATE ${BUSINESS_TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
      );

      await seedCatalogData(manager);
      // Carta de combos (§027) — 4 ofertas, idempotente por slug.
      await seedPromotionsData(manager);

      // Fila mínima obligatoria — sin ella /store/config → 404 y el home
      // de la app muestra error. Valores placeholder a confirmar.
      await manager.query(
        `INSERT INTO "store_settings"
          ("id", "name", "phone", "address", "delivery_fee", "min_delivery_order")
         VALUES ($1, 'Depredadog', NULL, 'Cl. 7ª, Pueblo Nuevo, Arauquita, Arauca', 2000, 10000)
         ON CONFLICT ("id") DO NOTHING`,
        [SETTINGS_ID],
      );

      for (const [i, h] of businessHours.entries()) {
        await manager.query(
          `INSERT INTO "business_hours"
            ("id", "day_of_week", "opens_at", "closes_at", "is_closed")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ("day_of_week") DO NOTHING`,
          [bh(i + 1), h.dayOfWeek, h.opensAt, h.closesAt, h.isClosed],
        );
      }
    });
    console.log('reset applied — catalog + store config');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
