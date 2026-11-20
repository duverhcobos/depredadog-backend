import dataSource from '../../../../typeorm.config';
import type { EntityManager } from 'typeorm';

// Seed de la carta REAL — fuente única del menú (dev y prod).
// Uso: npm run seed:catalog
// Idempotente: UUIDs fijos + ON CONFLICT; re-corre y corrige drift
// (nombre/descripción/precio se re-imponen por id).
// reset.seed.ts la reutiliza tras el wipe de producción (propuesta 025).

const u = (n: number): string =>
  `ca7a1090-0000-4000-8000-${n.toString().padStart(12, '0')}`;

const q = (v: string): string => `'${v.replace(/'/g, "''")}'`;

interface CategorySeed {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
}

interface ProductSeed {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  basePrice: number;
  sortOrder: number;
  /** Hero "El de la casa" en la app. */
  isFeatured?: boolean;
}

// Una sola categoría por ahora — el dueño descartó & Más, Bebidas y Combos.
const categories: CategorySeed[] = [
  { id: u(1), slug: 'perros', name: 'Perros', sortOrder: 0 },
];

// La carta real (imágenes del menú físico). Sin grupos de modificadores
// por ahora → la descripción lleva tagline + ingredientes de cada perro.
const products: ProductSeed[] = [
  {
    id: u(201),
    categoryId: u(1),
    name: 'El Cachorro',
    slug: 'cachorro',
    description:
      'El primer mordisco de la manada. Pan, salchicha tipo americana, queso mozzarella y huevo de codorniz.',
    basePrice: 14000,
    sortOrder: 0,
  },
  {
    id: u(202),
    categoryId: u(1),
    name: 'La Trampa',
    slug: 'trampa',
    description:
      'Lo dulce es el anzuelo. Pan, salchicha tipo americana, queso mozzarella, piña en trozos y tocineta crocante.',
    basePrice: 15000,
    sortOrder: 1,
  },
  {
    id: u(203),
    categoryId: u(1),
    name: 'Ave de Presa',
    slug: 'ave-presa',
    description:
      'Cayó directo del corral. Pan, salchicha, queso mozzarella, pollo desmechado, maíz dulce y huevo de codorniz.',
    basePrice: 16000,
    sortOrder: 2,
  },
  {
    id: u(204),
    categoryId: u(1),
    name: 'El Coyote',
    slug: 'coyote',
    description:
      'Cacería del desierto. Pan, salchicha, salsa de queso cheddar, chile con carne y maíz dulce.',
    basePrice: 16000,
    sortOrder: 3,
  },
  {
    id: u(205),
    categoryId: u(1),
    name: 'El Carnicero',
    slug: 'carnicero',
    description:
      'Carne sobre carne, sin piedad. Pan, salchicha, queso mozzarella, peperoni y tocineta crocante.',
    basePrice: 17000,
    sortOrder: 4,
  },
  {
    id: u(206),
    categoryId: u(1),
    name: 'El Depredador',
    slug: 'depredador',
    description:
      'El alfa come de todo. Pan, salchicha, queso mozzarella, carne desmechada, chile con carne, tocineta crocante, piña en trozos, maíz dulce y huevo de codorniz.',
    basePrice: 18000,
    sortOrder: 5,
    isFeatured: true,
  },
];

export async function seedCatalogData(manager: EntityManager): Promise<void> {
  await manager.query(`
    INSERT INTO "categories" ("id", "slug", "name", "sort_order")
    VALUES ${categories
      .map((c) => `(${q(c.id)}, ${q(c.slug)}, ${q(c.name)}, ${c.sortOrder})`)
      .join(', ')}
    ON CONFLICT DO NOTHING
  `);

  await manager.query(`
    INSERT INTO "products" ("id", "category_id", "name", "slug", "description", "base_price", "sort_order", "is_featured")
    VALUES ${products
      .map(
        (p) =>
          `(${q(p.id)}, ${q(p.categoryId)}, ${q(p.name)}, ${q(p.slug)}, ${q(p.description)}, ${p.basePrice}, ${p.sortOrder}, ${p.isFeatured ?? false})`,
      )
      .join(', ')}
    ON CONFLICT DO NOTHING
  `);

  // Re-imponer contenido real por id: filas sembradas con datos viejos
  // (precio/descripción/nombre) se corrigen en cada corrida — el seed ES
  // la fuente de verdad de la carta.
  for (const p of products) {
    await manager.query(
      `UPDATE "products" SET
         "slug" = ${q(p.slug)},
         "name" = ${q(p.name)},
         "description" = ${q(p.description)},
         "base_price" = ${p.basePrice},
         "sort_order" = ${p.sortOrder},
         "is_featured" = ${p.isFeatured ?? false},
         "is_available" = true
       WHERE "id" = ${q(p.id)}`,
    );
  }
}

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    await dataSource.manager.transaction(async (manager) => {
      await seedCatalogData(manager);
    });
    console.log('catalog seed applied');
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
