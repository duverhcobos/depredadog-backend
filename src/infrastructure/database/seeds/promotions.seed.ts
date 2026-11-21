import dataSource from '../../../../typeorm.config';
import type { EntityManager } from 'typeorm';

// Seed de la carta de combos/promos (§027) — fuente única de las 4
// ofertas (dev y prod).
// Uso: npm run seed:promotions
// Idempotente: slug fijo + ON CONFLICT DO UPDATE — re-corre y
// corrige drift (nombre/tagline/config/orden se re-imponen por slug).
// reset.seed.ts la reutiliza tras el wipe de producción.

const u = (n: number): string =>
  `ca7a1090-0000-4000-8000-${n.toString().padStart(12, '0')}`;

// Ids fijos del catálogo real (catalog.seed.ts).
const CACHORRO = u(201);
const TRAMPA = u(202);
const AVE_PRESA = u(203);
const COYOTE = u(204);
const CARNICERO = u(205);
const DEPREDADOR = u(206);
const PAPAS = u(231);
// Los 6 perros — elegibilidad EXPLÍCITA (nunca por categoría: una
// promo futura puede excluir uno sin migración).
const DOGS = [CACHORRO, TRAMPA, AVE_PRESA, COYOTE, CARNICERO, DEPREDADOR];

interface PromotionSeed {
  slug: string;
  name: string;
  tagline: string;
  kind: 'fixed_bundle' | 'free_item' | 'percent_off' | 'showcase';
  config: Record<string, unknown>;
  sortOrder: number;
}

const promotions: PromotionSeed[] = [
  {
    // Cachorro + Papas a $17.000 — ahorro = 14.000+5.000−17.000 = 2.000.
    slug: 'combo-cachorro',
    name: 'Combo Cachorro',
    tagline: 'Un antojo bien cazado.',
    kind: 'fixed_bundle',
    config: {
      items: [
        { productId: CACHORRO, qty: 1 },
        { productId: PAPAS, qty: 1 },
      ],
      price: 17000,
    },
    sortOrder: 0,
  },
  {
    // 2-3 perros → papas de la casa (las cubre si ya las pidió; si no,
    // se auto-agregan). A 4+ la reemplaza manada-15 — tiers excluyentes.
    slug: 'papas-gratis',
    name: 'Papas Gratis',
    tagline: 'Con 2 o 3 perros, las papas van de la casa.',
    kind: 'free_item',
    config: {
      eligibleProductIds: DOGS,
      minQty: 2,
      maxQty: 3,
      freeProductId: PAPAS,
      freeQty: 1,
    },
    sortOrder: 1,
  },
  {
    // Exhibidor de papas-gratis sobre 2× Depredador — card aparte en la
    // app, sin regla propia (la mecánica la cubre papas-gratis).
    slug: 'duo-alfa',
    name: 'Dúo Alfa',
    tagline: 'Dos Depredador y las papas van de la casa.',
    kind: 'showcase',
    config: {
      items: [{ productId: DEPREDADOR, qty: 2 }],
      priceLabel: '$36.000',
    },
    sortOrder: 2,
  },
  {
    // 4+ perros → −15% sobre las líneas de esos perros (base +
    // modificadores), redondeo a $500 hacia abajo. Bebidas, & más y
    // deliveryFee jamás descuentan.
    slug: 'manada-15',
    name: 'Manada −15%',
    tagline: 'Cuatro perros o más: la manada descuenta.',
    kind: 'percent_off',
    config: {
      eligibleProductIds: DOGS,
      minQty: 4,
      percent: 15,
      roundDownTo: 500,
    },
    sortOrder: 3,
  },
];

export async function seedPromotionsData(
  manager: EntityManager,
): Promise<void> {
  for (const p of promotions) {
    await manager.query(
      `INSERT INTO "promotions" ("slug", "name", "tagline", "kind", "config", "sort_order")
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT ("slug") DO UPDATE SET
         "name" = EXCLUDED."name",
         "tagline" = EXCLUDED."tagline",
         "kind" = EXCLUDED."kind",
         "config" = EXCLUDED."config",
         "sort_order" = EXCLUDED."sort_order",
         "is_active" = true`,
      [
        p.slug,
        p.name,
        p.tagline,
        p.kind,
        JSON.stringify(p.config),
        p.sortOrder,
      ],
    );
  }
}

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    await dataSource.manager.transaction(async (manager) => {
      await seedPromotionsData(manager);
    });
    console.log('promotions seed applied');
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
