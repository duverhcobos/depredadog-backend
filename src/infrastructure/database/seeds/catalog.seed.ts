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
  groupId: string;
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
  /** Grupos enlazados al producto (product_modifier_groups). */
  modifierGroupIds: string[];
  /** Opciones incluidas por defecto (product_modifier_options). */
  defaultOptionIds: string[];
}

// La carta completa: perros, bebidas y & más (las dos últimas vuelven
// con la carta física del dueño, 2026-11-20).
const categories: CategorySeed[] = [
  { id: u(1), slug: 'perros', name: 'Perros', sortOrder: 0 },
  { id: u(2), slug: 'bebidas', name: 'Bebidas', sortOrder: 1 },
  { id: u(3), slug: 'y-mas', name: '& Más', sortOrder: 2 },
];

// Ingredientes alimenta ingredientsSummary en las cards/detalle y el
// "quítale X" del sheet. Toppings y Salsas "a elegir" vuelven con la
// carta física — gratis, opcionales y SIN tope (decisión del dueño).
const groups: GroupSeed[] = [
  { id: u(11), slug: 'ingredients', name: 'Ingredientes', sortOrder: 0 },
  { id: u(12), slug: 'toppings', name: 'Toppings', sortOrder: 1 },
  { id: u(13), slug: 'sauces', name: 'Salsas', sortOrder: 2 },
];

// Ingredientes/adicionales de la carta real (imagen "ADICIONALES" —
// precios verificados contra la carta física 2026-11-20, sort_order =
// orden de la carta por filas). Pan y salchicha son no-removibles
// (corazón del perro — regla del usuario) y no se venden como extras.
const ingredientOptions: OptionSeed[] = [
  { id: u(101), groupId: u(11), name: 'Pan', extraPrice: 0, isRemovable: false, sortOrder: -1 },
  {
    id: u(102),
    groupId: u(11),
    name: 'Salchicha americana',
    extraPrice: 0,
    isRemovable: false,
    sortOrder: 0,
  },
  {
    id: u(108),
    groupId: u(11),
    name: 'Queso mozzarella',
    extraPrice: 2000,
    isRemovable: true,
    sortOrder: 1,
  },
  {
    id: u(112),
    groupId: u(11),
    name: 'Huevo de codorniz',
    extraPrice: 500,
    isRemovable: true,
    sortOrder: 2,
  },
  {
    id: u(111),
    groupId: u(11),
    name: 'Maíz dulce',
    extraPrice: 1000,
    isRemovable: true,
    sortOrder: 3,
  },
  {
    id: u(106),
    groupId: u(11),
    name: 'Tocineta crocante',
    extraPrice: 1500,
    isRemovable: true,
    sortOrder: 4,
  },
  {
    id: u(110),
    groupId: u(11),
    name: 'Piña en trozos',
    extraPrice: 1000,
    isRemovable: true,
    sortOrder: 5,
  },
  {
    id: u(105),
    groupId: u(11),
    name: 'Chile con carne',
    extraPrice: 1500,
    isRemovable: true,
    sortOrder: 6,
  },
  {
    id: u(104),
    groupId: u(11),
    name: 'Pollo desmechado',
    extraPrice: 2500,
    isRemovable: true,
    sortOrder: 7,
  },
  {
    id: u(109),
    groupId: u(11),
    name: 'Salsa de queso cheddar',
    extraPrice: 1000,
    isRemovable: true,
    sortOrder: 8,
  },
  {
    id: u(103),
    groupId: u(11),
    name: 'Carne desmechada',
    extraPrice: 2500,
    isRemovable: true,
    sortOrder: 9,
  },
  {
    id: u(107),
    groupId: u(11),
    name: 'Peperoni',
    extraPrice: 2500,
    isRemovable: true,
    sortOrder: 10,
  },
];

// Toppings "a elegir" de la carta física — gratis (extra_price 0),
// nunca incluidos por defecto ni removibles (no aplican a "quítale").
const toppingOptions: OptionSeed[] = [
  { id: u(121), groupId: u(12), name: 'Cebolla', extraPrice: 0, isRemovable: false, sortOrder: 0 },
  { id: u(122), groupId: u(12), name: 'Tomate con cilantro', extraPrice: 0, isRemovable: false, sortOrder: 1 },
  { id: u(123), groupId: u(12), name: 'Jalapeños picantes', extraPrice: 0, isRemovable: false, sortOrder: 2 },
  { id: u(124), groupId: u(12), name: 'Tostacos', extraPrice: 0, isRemovable: false, sortOrder: 3 },
  { id: u(125), groupId: u(12), name: 'Papa ripio', extraPrice: 0, isRemovable: false, sortOrder: 4 },
];

// Salsas "a elegir" de la carta física — mismas reglas que toppings.
const sauceOptions: OptionSeed[] = [
  { id: u(131), groupId: u(13), name: 'BBQ', extraPrice: 0, isRemovable: false, sortOrder: 0 },
  { id: u(132), groupId: u(13), name: 'Tomate', extraPrice: 0, isRemovable: false, sortOrder: 1 },
  { id: u(133), groupId: u(13), name: 'Mostaza', extraPrice: 0, isRemovable: false, sortOrder: 2 },
  { id: u(134), groupId: u(13), name: 'Piña', extraPrice: 0, isRemovable: false, sortOrder: 3 },
  { id: u(135), groupId: u(13), name: 'Tártara', extraPrice: 0, isRemovable: false, sortOrder: 4 },
  { id: u(136), groupId: u(13), name: 'Mayonesa', extraPrice: 0, isRemovable: false, sortOrder: 5 },
];

const allOptions: OptionSeed[] = [
  ...ingredientOptions,
  ...toppingOptions,
  ...sauceOptions,
];

// La carta real (imágenes del menú físico). description = tagline solo;
// la composición vive en defaultOptionIds.
const perroGroups = [u(11), u(12), u(13)];
const freeGroups = [u(12), u(13)];

const products: ProductSeed[] = [
  {
    id: u(201),
    categoryId: u(1),
    name: 'El Cachorro',
    slug: 'cachorro',
    description: 'El primer mordisco de la manada.',
    basePrice: 14000,
    sortOrder: 0,
    modifierGroupIds: perroGroups,
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
    modifierGroupIds: perroGroups,
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
    modifierGroupIds: perroGroups,
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
    modifierGroupIds: perroGroups,
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
    modifierGroupIds: perroGroups,
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
    modifierGroupIds: perroGroups,
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
  // Bebidas de la carta física — sin personalización (groups vacíos).
  {
    id: u(211),
    categoryId: u(2),
    name: 'Coca Cola 400 ml',
    slug: 'coca-cola-400',
    description: '',
    basePrice: 3000,
    sortOrder: 0,
    modifierGroupIds: [],
    defaultOptionIds: [],
  },
  {
    id: u(212),
    categoryId: u(2),
    name: 'Coca Cola 1 litro',
    slug: 'coca-cola-1l',
    description: '',
    basePrice: 6000,
    sortOrder: 1,
    modifierGroupIds: [],
    defaultOptionIds: [],
  },
  {
    id: u(213),
    categoryId: u(2),
    name: 'Coca Cola 1.5 litro',
    slug: 'coca-cola-15l',
    description: '',
    basePrice: 8000,
    sortOrder: 2,
    modifierGroupIds: [],
    defaultOptionIds: [],
  },
  {
    id: u(214),
    categoryId: u(2),
    name: 'Coca Cola 3 litros',
    slug: 'coca-cola-3l',
    description: '',
    basePrice: 12000,
    sortOrder: 3,
    modifierGroupIds: [],
    defaultOptionIds: [],
  },
  {
    id: u(215),
    categoryId: u(2),
    name: 'Pony Malta 330 ml',
    slug: 'pony-malta-330',
    description: '',
    basePrice: 3000,
    sortOrder: 4,
    modifierGroupIds: [],
    defaultOptionIds: [],
  },
  {
    id: u(216),
    categoryId: u(2),
    name: 'Pony Malta 1 litro',
    slug: 'pony-malta-1l',
    description: '',
    basePrice: 6000,
    sortOrder: 5,
    modifierGroupIds: [],
    defaultOptionIds: [],
  },
  {
    id: u(217),
    categoryId: u(2),
    name: 'Pony Malta 1.5 litros',
    slug: 'pony-malta-15l',
    description: '',
    basePrice: 8000,
    sortOrder: 6,
    modifierGroupIds: [],
    defaultOptionIds: [],
  },
  {
    id: u(218),
    categoryId: u(2),
    name: 'Big Cola 400 ml',
    slug: 'big-cola-400',
    description: '',
    basePrice: 2000,
    sortOrder: 7,
    modifierGroupIds: [],
    defaultOptionIds: [],
  },
  {
    id: u(219),
    categoryId: u(2),
    name: 'Big Cola 1 litro',
    slug: 'big-cola-1l',
    description: '',
    basePrice: 3000,
    sortOrder: 8,
    modifierGroupIds: [],
    defaultOptionIds: [],
  },
  {
    id: u(220),
    categoryId: u(2),
    name: 'Big Cola 1.75 litros',
    slug: 'big-cola-175l',
    description: '',
    basePrice: 5000,
    sortOrder: 9,
    modifierGroupIds: [],
    defaultOptionIds: [],
  },
  {
    id: u(221),
    categoryId: u(2),
    name: 'Big Cola 3 litros',
    slug: 'big-cola-3l',
    description: '',
    basePrice: 9000,
    sortOrder: 10,
    modifierGroupIds: [],
    defaultOptionIds: [],
  },
  {
    id: u(222),
    categoryId: u(2),
    name: 'Jugo Hit 500 ml',
    slug: 'jugo-hit-500',
    description: '',
    basePrice: 3000,
    sortOrder: 11,
    modifierGroupIds: [],
    defaultOptionIds: [],
  },
  {
    id: u(223),
    categoryId: u(2),
    name: 'Botella de agua',
    slug: 'agua-botella',
    description: '',
    basePrice: 2000,
    sortOrder: 12,
    modifierGroupIds: [],
    defaultOptionIds: [],
  },
  // & Más — receta fija + toppings/salsas "a elegir" (decisión del
  // dueño: los grupos gratis aplican a perros Y a & más).
  {
    id: u(231),
    categoryId: u(3),
    name: 'Papas a la francesa',
    slug: 'papas-francesa',
    description: '',
    basePrice: 5000,
    sortOrder: 0,
    modifierGroupIds: freeGroups,
    defaultOptionIds: [],
  },
  {
    id: u(232),
    categoryId: u(3),
    name: 'Bacon Cheese Fries',
    slug: 'bacon-cheese-fries',
    description:
      'Papas a la francesa, tocineta crocante y salsa de queso cheddar.',
    basePrice: 8000,
    sortOrder: 1,
    modifierGroupIds: freeGroups,
    defaultOptionIds: [],
  },
  {
    id: u(233),
    categoryId: u(3),
    name: 'Dorisalvaje',
    slug: 'dorisalvaje',
    description:
      'Doritos, carne desmechada, salsa de queso cheddar, maíz dulce y tocineta.',
    basePrice: 12000,
    sortOrder: 2,
    modifierGroupIds: freeGroups,
    defaultOptionIds: [],
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
    VALUES ${allOptions
      .map(
        (o) =>
          `(${q(o.id)}, ${q(o.groupId)}, ${q(o.name)}, ${o.extraPrice}, ${o.isRemovable}, ${o.sortOrder})`,
      )
      .join(', ')}
    ON CONFLICT DO NOTHING
  `);

  // Re-imponer precios/orden de la carta por id — el seed es la fuente
  // de verdad de los adicionales igual que de los productos.
  for (const o of allOptions) {
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

  // Cada producto enlaza SOLO sus grupos — las bebidas quedan sin
  // personalización; & más lleva toppings+salsas sin ingredientes.
  const productGroups = products.flatMap((p) =>
    p.modifierGroupIds.map((groupId) => ({ productId: p.id, groupId })),
  );
  await manager.query(`
    INSERT INTO "product_modifier_groups" ("product_id", "group_id")
    VALUES ${productGroups
      .map((g) => `(${q(g.productId)}, ${q(g.groupId)})`)
      .join(', ')}
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
