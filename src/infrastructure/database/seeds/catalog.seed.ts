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

interface GroupSeed {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
}

interface OptionSeed {
  id: string;
  name: string;
  extraPrice: number;
  isRemovable: boolean;
  sortOrder: number;
}

interface ProductSeed {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  /** Tagline de la carta — va SOLO el eslogan (la app lo pinta en las
   *  cards; la composición la da ingredientsSummary desde los mods). */
  description: string;
  basePrice: number;
  sortOrder: number;
  /** Hero "El de la casa" en la app. */
  isFeatured?: boolean;
  /** Opciones incluidas por defecto (product_modifier_options). */
  defaultOptionIds: string[];
}

// Una sola categoría por ahora — el dueño descartó & Más, Bebidas y Combos.
const categories: CategorySeed[] = [
  { id: u(1), slug: 'perros', name: 'Perros', sortOrder: 0 },
];

// Solo el grupo Ingredientes — alimenta ingredientsSummary en las
// cards/detalle y el "quítale X" del sheet. Toppings y Salsas siguen
// fuera por decisión del dueño ("no van por ahora").
const groups: GroupSeed[] = [
  { id: u(11), slug: 'ingredients', name: 'Ingredientes', sortOrder: 0 },
];

// Ingredientes/adicionales de la carta real (imagen "ADICIONALES" —
// precios verificados contra la carta física 2026-11-20, sort_order =
// orden de la carta por filas). Pan y salchicha son no-removibles
// (corazón del perro — regla del usuario) y no se venden como extras.
const ingredientOptions: OptionSeed[] = [
  { id: u(101), name: 'Pan', extraPrice: 0, isRemovable: false, sortOrder: -1 },
  {
    id: u(102),
    name: 'Salchicha americana',
    extraPrice: 0,
    isRemovable: false,
    sortOrder: 0,
  },
  {
    id: u(108),
    name: 'Queso mozzarella',
    extraPrice: 2000,
    isRemovable: true,
    sortOrder: 1,
  },
  {
    id: u(112),
    name: 'Huevo de codorniz',
    extraPrice: 500,
    isRemovable: true,
    sortOrder: 2,
  },
  {
    id: u(111),
    name: 'Maíz dulce',
    extraPrice: 1000,
    isRemovable: true,
    sortOrder: 3,
  },
  {
    id: u(106),
    name: 'Tocineta crocante',
    extraPrice: 1500,
    isRemovable: true,
    sortOrder: 4,
  },
  {
    id: u(110),
    name: 'Piña en trozos',
    extraPrice: 1000,
    isRemovable: true,
    sortOrder: 5,
  },
  {
    id: u(105),
    name: 'Chile con carne',
    extraPrice: 1500,
    isRemovable: true,
    sortOrder: 6,
  },
  {
    id: u(104),
    name: 'Pollo desmechado',
    extraPrice: 2500,
    isRemovable: true,
    sortOrder: 7,
  },
  {
    id: u(109),
    name: 'Salsa de queso cheddar',
    extraPrice: 1000,
    isRemovable: true,
    sortOrder: 8,
  },
  {
    id: u(103),
    name: 'Carne desmechada',
    extraPrice: 2500,
    isRemovable: true,
    sortOrder: 9,
  },
  {
    id: u(107),
    name: 'Peperoni',
    extraPrice: 2500,
    isRemovable: true,
    sortOrder: 10,
  },
];

// La carta real (imágenes del menú físico). description = tagline solo;
// la composición vive en defaultOptionIds.
const products: ProductSeed[] = [
  {
    id: u(201),
    categoryId: u(1),
    name: 'El Cachorro',
    slug: 'cachorro',
    description: 'El primer mordisco de la manada.',
    basePrice: 14000,
    sortOrder: 0,
    defaultOptionIds: [u(101), u(102), u(108), u(112)],
  },
  {
    id: u(202),
    categoryId: u(1),
    name: 'La Trampa',
    slug: 'trampa',
    description: 'Lo dulce es el anzuelo.',
    basePrice: 15000,
    sortOrder: 1,
    defaultOptionIds: [u(101), u(102), u(108), u(110), u(106)],
  },
  {
    id: u(203),
    categoryId: u(1),
    name: 'Ave de Presa',
    slug: 'ave-presa',
    description: 'Cayó directo del corral.',
    basePrice: 16000,
    sortOrder: 2,
    defaultOptionIds: [u(101), u(102), u(104), u(111), u(108), u(112)],
  },
  {
    id: u(204),
    categoryId: u(1),
    name: 'El Coyote',
    slug: 'coyote',
    description: 'Cacería del desierto.',
    basePrice: 16000,
    sortOrder: 3,
    defaultOptionIds: [u(101), u(102), u(105), u(109), u(111)],
  },
  {
    id: u(205),
    categoryId: u(1),
    name: 'El Carnicero',
    slug: 'carnicero',
    description: 'Carne sobre carne, sin piedad.',
    basePrice: 17000,
    sortOrder: 4,
    defaultOptionIds: [u(101), u(102), u(107), u(106), u(108)],
  },
  {
    id: u(206),
    categoryId: u(1),
    name: 'El Depredador',
    slug: 'depredador',
    description: 'El alfa come de todo.',
    basePrice: 18000,
    sortOrder: 5,
    isFeatured: true,
    defaultOptionIds: [
      u(101),
      u(102),
      u(103),
      u(105),
      u(106),
      u(110),
      u(111),
      u(108),
      u(112),
    ],
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
    INSERT INTO "modifier_groups" ("id", "slug", "name", "sort_order")
    VALUES ${groups
      .map((g) => `(${q(g.id)}, ${q(g.slug)}, ${q(g.name)}, ${g.sortOrder})`)
      .join(', ')}
    ON CONFLICT DO NOTHING
  `);

  await manager.query(`
    INSERT INTO "modifier_options" ("id", "group_id", "name", "extra_price", "is_removable", "sort_order")
    VALUES ${ingredientOptions
      .map(
        (o) =>
          `(${q(o.id)}, ${q(u(11))}, ${q(o.name)}, ${o.extraPrice}, ${o.isRemovable}, ${o.sortOrder})`,
      )
      .join(', ')}
    ON CONFLICT DO NOTHING
  `);

  // Re-imponer precios/orden de la carta por id — el seed es la fuente
  // de verdad de los adicionales igual que de los productos.
  for (const o of ingredientOptions) {
    await manager.query(
      `UPDATE "modifier_options" SET
         "name" = ${q(o.name)},
         "extra_price" = ${o.extraPrice},
         "is_removable" = ${o.isRemovable},
         "sort_order" = ${o.sortOrder}
       WHERE "id" = ${q(o.id)}`,
    );
  }

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

  // Todos los perros enlazados al grupo ingredientes (único por ahora).
  await manager.query(`
    INSERT INTO "product_modifier_groups" ("product_id", "group_id")
    VALUES ${products.map((p) => `(${q(p.id)}, ${q(u(11))})`).join(', ')}
    ON CONFLICT DO NOTHING
  `);

  // Composición por defecto de cada perro — sparse: solo las incluidas;
  // el resto del grupo se ofrece como adicional con su extra_price.
  const productOptions = products.flatMap((p) =>
    p.defaultOptionIds.map((optionId, i) => ({
      productId: p.id,
      optionId,
      sortOrder: i,
    })),
  );
  await manager.query(`
    INSERT INTO "product_modifier_options" ("product_id", "option_id", "included_by_default", "sort_order")
    VALUES ${productOptions
      .map(
        (o) =>
          `(${q(o.productId)}, ${q(o.optionId)}, true, ${o.sortOrder})`,
      )
      .join(', ')}
    ON CONFLICT DO NOTHING
  `);

  // Corazón del perro: ni se cambia, ni se regala, y si se agota
  // tumba el producto (regla del usuario).
  await manager.query(
    `UPDATE "modifier_options"
        SET "is_replaceable" = false,
            "is_replacement_eligible" = false,
            "is_essential" = true
      WHERE "name" IN ('Salchicha americana', 'Pan')`,
  );
  // Extras caros: se venden pero no se regalan como cambio gratis.
  await manager.query(
    `UPDATE "modifier_options"
        SET "is_replacement_eligible" = false
      WHERE "name" IN ('Carne desmechada', 'Pollo desmechado')`,
  );
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
