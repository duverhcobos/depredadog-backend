import dataSource from '../../../../typeorm.config';

// Seed de desarrollo de la carta — idempotente por slugs/nombres.
// Uso: npm run seed:catalog

// UUIDs fijos → ON CONFLICT DO NOTHING hace el seed re-ejecutable.
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
  description: string;
  basePrice: number;
  sortOrder: number;
  /** Opciones incluidas por defecto (product_modifier_options). */
  defaultOptionIds: string[];
}

// Categorías del mock (slugs = segmentos de ruta de la app).
const categories: CategorySeed[] = [
  { id: u(1), slug: 'perros', name: 'Perros', sortOrder: 0 },
  { id: u(2), slug: 'mas', name: '& Más', sortOrder: 1 },
  { id: u(3), slug: 'bebidas', name: 'Bebidas', sortOrder: 2 },
  { id: u(4), slug: 'combos', name: 'Combos', sortOrder: 3 },
];

// Grupos compartidos — min_select=0 / max_select=NULL (ilimitados) por
// defecto; toppings y salsas son gratis e ilimitados en el mock.
const groups: GroupSeed[] = [
  { id: u(11), slug: 'ingredients', name: 'Ingredientes', sortOrder: 0 },
  { id: u(12), slug: 'toppings', name: 'Toppings', sortOrder: 1 },
  { id: u(13), slug: 'sauces', name: 'Salsas', sortOrder: 2 },
];

// ingredientCatalog del mock (mismo orden = sort_order). Pan no se ofrece
// en la app pero existe como opción no-removible incluida en todo perro;
// la salchicha también no-removible y además se vende como adicional
// "doble" (extra_price del mock).
const ingredientOptions: OptionSeed[] = [
  { id: u(101), name: 'Pan', extraPrice: 0, isRemovable: false, sortOrder: -1 },
  {
    id: u(102),
    name: 'Salchicha americana',
    extraPrice: 5000,
    isRemovable: false,
    sortOrder: 0,
  },
  {
    id: u(103),
    name: 'Carne desmechada',
    extraPrice: 5000,
    isRemovable: true,
    sortOrder: 1,
  },
  {
    id: u(104),
    name: 'Pollo desmechado',
    extraPrice: 4500,
    isRemovable: true,
    sortOrder: 2,
  },
  {
    id: u(105),
    name: 'Chile con carne',
    extraPrice: 4500,
    isRemovable: true,
    sortOrder: 3,
  },
  {
    id: u(106),
    name: 'Tocineta crocante',
    extraPrice: 4000,
    isRemovable: true,
    sortOrder: 4,
  },
  {
    id: u(107),
    name: 'Salami',
    extraPrice: 4000,
    isRemovable: true,
    sortOrder: 5,
  },
  {
    id: u(108),
    name: 'Queso mozzarella',
    extraPrice: 3500,
    isRemovable: true,
    sortOrder: 6,
  },
  {
    id: u(109),
    name: 'Salsa de queso cheddar',
    extraPrice: 3000,
    isRemovable: true,
    sortOrder: 7,
  },
  {
    id: u(110),
    name: 'Piña en trozos',
    extraPrice: 3000,
    isRemovable: true,
    sortOrder: 8,
  },
  {
    id: u(111),
    name: 'Maíz dulce',
    extraPrice: 2500,
    isRemovable: true,
    sortOrder: 9,
  },
  {
    id: u(112),
    name: 'Huevo de codorniz',
    extraPrice: 2500,
    isRemovable: true,
    sortOrder: 10,
  },
];

// toppingCatalog del mock — provisionales, gratis (pendientes/005).
const toppingOptions: OptionSeed[] = [
  {
    id: u(121),
    name: 'Papa ripio',
    extraPrice: 0,
    isRemovable: true,
    sortOrder: 0,
  },
  {
    id: u(122),
    name: 'Queso rallado',
    extraPrice: 0,
    isRemovable: true,
    sortOrder: 1,
  },
  {
    id: u(123),
    name: 'Cebolla crispy',
    extraPrice: 0,
    isRemovable: true,
    sortOrder: 2,
  },
  {
    id: u(124),
    name: 'Tocineta picada',
    extraPrice: 0,
    isRemovable: true,
    sortOrder: 3,
  },
  {
    id: u(125),
    name: 'Jalapeños',
    extraPrice: 0,
    isRemovable: true,
    sortOrder: 4,
  },
];

// sauceCatalog del mock — provisionales, gratis (pendientes/005).
const sauceOptions: OptionSeed[] = [
  {
    id: u(131),
    name: 'Ketchup',
    extraPrice: 0,
    isRemovable: true,
    sortOrder: 0,
  },
  {
    id: u(132),
    name: 'Mayonesa',
    extraPrice: 0,
    isRemovable: true,
    sortOrder: 1,
  },
  {
    id: u(133),
    name: 'Mostaza',
    extraPrice: 0,
    isRemovable: true,
    sortOrder: 2,
  },
  {
    id: u(134),
    name: 'Salsa de piña',
    extraPrice: 0,
    isRemovable: true,
    sortOrder: 3,
  },
  {
    id: u(135),
    name: 'Salsa rosada',
    extraPrice: 0,
    isRemovable: true,
    sortOrder: 4,
  },
  {
    id: u(136),
    name: 'Salsa tártara',
    extraPrice: 0,
    isRemovable: true,
    sortOrder: 5,
  },
  { id: u(137), name: 'BBQ', extraPrice: 0, isRemovable: true, sortOrder: 6 },
];

// Los 7 ítems del mock — description = tagline de la carta.
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
    basePrice: 16000,
    sortOrder: 1,
    defaultOptionIds: [u(101), u(102), u(108), u(110), u(106)],
  },
  {
    id: u(203),
    categoryId: u(1),
    name: 'Ave de Presa',
    slug: 'ave-presa',
    description: 'Cayó directo del corral.',
    basePrice: 18000,
    sortOrder: 2,
    defaultOptionIds: [u(101), u(102), u(104), u(111), u(108), u(112)],
  },
  {
    id: u(204),
    categoryId: u(1),
    name: 'El Coyote',
    slug: 'coyote',
    description: 'Cacería del desierto.',
    basePrice: 18000,
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
    basePrice: 25000,
    sortOrder: 5,
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
  {
    id: u(211),
    categoryId: u(2),
    name: 'Manada de Papas',
    slug: 'manada-papas',
    description: 'Con las salsas de la casa.',
    basePrice: 10000,
    sortOrder: 0,
    defaultOptionIds: [],
  },
];

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    await dataSource.transaction(async (manager) => {
      await manager.query(`
        INSERT INTO "categories" ("id", "name", "slug", "sort_order")
        VALUES ${categories
          .map(
            (c) => `(${q(c.id)}, ${q(c.name)}, ${q(c.slug)}, ${c.sortOrder})`,
          )
          .join(', ')}
        ON CONFLICT DO NOTHING
      `);

      await manager.query(`
        INSERT INTO "modifier_groups" ("id", "slug", "name", "sort_order")
        VALUES ${groups.map((g) => `(${q(g.id)}, ${q(g.slug)}, ${q(g.name)}, ${g.sortOrder})`).join(', ')}
        ON CONFLICT DO NOTHING
      `);

      const options: { groupId: string; option: OptionSeed }[] = [
        ...ingredientOptions.map((option) => ({ groupId: u(11), option })),
        ...toppingOptions.map((option) => ({ groupId: u(12), option })),
        ...sauceOptions.map((option) => ({ groupId: u(13), option })),
      ];
      await manager.query(`
        INSERT INTO "modifier_options" ("id", "group_id", "name", "extra_price", "is_removable", "sort_order")
        VALUES ${options
          .map(
            ({ groupId, option: o }) =>
              `(${q(o.id)}, ${q(groupId)}, ${q(o.name)}, ${o.extraPrice}, ${o.isRemovable}, ${o.sortOrder})`,
          )
          .join(', ')}
        ON CONFLICT DO NOTHING
      `);

      await manager.query(`
        INSERT INTO "products" ("id", "category_id", "name", "slug", "description", "base_price", "sort_order")
        VALUES ${products
          .map(
            (p) =>
              `(${q(p.id)}, ${q(p.categoryId)}, ${q(p.name)}, ${q(p.slug)}, ${q(p.description)}, ${p.basePrice}, ${p.sortOrder})`,
          )
          .join(', ')}
        ON CONFLICT DO NOTHING
      `);

      // Filas sembradas antes de la columna traen el placeholder
      // 'product-<uuid>' de la migración — se pisan con el slug real.
      for (const p of products) {
        await manager.query(
          `UPDATE "products" SET "slug" = ${q(p.slug)} WHERE "id" = ${q(p.id)} AND "slug" <> ${q(p.slug)}`,
        );
      }

      // Perros y papas enlazados a los 3 grupos (ingredientes/toppings/salsas).
      const productGroupLinks = products.flatMap((p) =>
        groups.map((g) => ({ productId: p.id, groupId: g.id })),
      );
      await manager.query(`
        INSERT INTO "product_modifier_groups" ("product_id", "group_id")
        VALUES ${productGroupLinks.map((l) => `(${q(l.productId)}, ${q(l.groupId)})`).join(', ')}
        ON CONFLICT DO NOTHING
      `);

      // Defaults por producto: ingredientIds del mock + pan y salchicha en
      // TODOS los perros (ambas no-removibles a nivel catálogo).
      const productOptions = products.flatMap((p) =>
        p.defaultOptionIds.map((optionId, i) => ({
          productId: p.id,
          optionId,
          sortOrder: i,
        })),
      );
      if (productOptions.length > 0) {
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
      }
    });
    console.log('catalog seed applied');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
