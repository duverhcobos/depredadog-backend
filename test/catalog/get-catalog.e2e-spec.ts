import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Category } from '../../src/modules/catalog/domain/entities/category.entity';
import { ModifierGroup } from '../../src/modules/catalog/domain/entities/modifier-group.entity';
import { ModifierOption } from '../../src/modules/catalog/domain/entities/modifier-option.entity';
import { Product } from '../../src/modules/catalog/domain/entities/product.entity';
import { ProductImage } from '../../src/modules/catalog/domain/entities/product-image.entity';
import { ProductModifierGroup } from '../../src/modules/catalog/domain/entities/product-modifier-group.entity';
import { ProductModifierOption } from '../../src/modules/catalog/domain/entities/product-modifier-option.entity';
import { Promotion } from '../../src/modules/promotions/domain/entities/promotion.entity';
import { PromotionKind } from '../../src/modules/promotions/domain/enums/promotion-kind.enum';
import {
  activateAndGetTokens,
  cleanAuthTables,
  createE2EApp,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('GET /catalog (e2e)', () => {
  let app: INestApplication;
  const email = 'catalog@test.com';
  let tokens: { accessToken: string; refreshToken: string };

  async function cleanCatalogTables(): Promise<void> {
    const ds = app.get(DataSource);
    await ds.query(
      'TRUNCATE product_modifier_options, product_modifier_groups, modifier_options, modifier_groups, combo_items, product_images, products, categories, promotions RESTART IDENTITY CASCADE',
    );
  }

  async function seedMenu(): Promise<void> {
    const ds = app.get(DataSource);
    const category = await ds.getRepository(Category).save({
      name: 'Perros',
      slug: 'perros',
      sortOrder: 0,
    });
    const product = await ds.getRepository(Product).save({
      categoryId: category.id,
      name: 'El Cachorro',
      slug: 'el-cachorro',
      description: 'El primer mordisco de la manada.',
      basePrice: 14000,
      sortOrder: 0,
    });
    await ds.getRepository(ProductImage).save({
      productId: product.id,
      imageUrl: 'https://cdn.test/cachorro.png',
      sortOrder: 0,
      isPrimary: true,
    });
    const group = await ds.getRepository(ModifierGroup).save({
      slug: 'ingredients',
      name: 'Ingredientes',
      minSelect: 0,
      maxSelect: null,
    });
    const mozzarella = await ds.getRepository(ModifierOption).save({
      groupId: group.id,
      name: 'Queso mozzarella',
      extraPrice: 3500,
      isRemovable: true,
      isAvailable: true,
      sortOrder: 0,
    });
    await ds.getRepository(ModifierOption).save({
      groupId: group.id,
      name: 'Pan',
      extraPrice: 0,
      isRemovable: false,
      isAvailable: true,
      isReplaceable: false,
      isReplacementEligible: false,
      isEssential: true,
      sortOrder: 1,
    });
    await ds.getRepository(ProductModifierGroup).save({
      productId: product.id,
      groupId: group.id,
    });
    await ds.getRepository(ProductModifierOption).save({
      productId: product.id,
      optionId: mozzarella.id,
      includedByDefault: true,
      sortOrder: 0,
    });
  }

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanCatalogTables();
    await cleanAuthTables(app);
    await registerUser(app, { email });
    tokens = await activateAndGetTokens(app, email);
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('GET /catalog → 200 sin Authorization (público §020)', async () => {
    const res = await request(app.getHttpServer() as App)
      .get('/catalog')
      .expect(200);

    // Sin seed el menú viene vacío — el punto es que el guard deja pasar.
    expect((res.body as { categories: unknown[] }).categories).toEqual([]);
  });

  it('devuelve el menú completo con el árbol de modificadores', async () => {
    await seedMenu();

    const res = await request(app.getHttpServer() as App)
      .get('/catalog')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);

    const body = res.body as {
      categories: {
        id: string;
        slug: string;
        name: string;
        sortOrder: number;
        products: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          basePrice: number;
          imageUrl: string | null;
          isAvailable: boolean;
          isFeatured: boolean;
          isCombo: boolean;
          sortOrder: number;
          modifierGroups: {
            id: string;
            slug: string;
            name: string;
            minSelect: number;
            maxSelect: number | null;
            options: {
              id: string;
              name: string;
              extraPrice: number;
              isAvailable: boolean;
              includedByDefault: boolean;
              isRemovable: boolean;
              sortOrder: number;
              isReplaceable: boolean;
              isReplacementEligible: boolean;
              isEssential: boolean;
            }[];
          }[];
        }[];
      }[];
    };

    expect(body.categories).toHaveLength(1);
    const category = body.categories[0];
    expect(category.slug).toBe('perros');
    expect(category.name).toBe('Perros');
    expect(category.sortOrder).toBe(0);

    expect(category.products).toHaveLength(1);
    const product = category.products[0];
    expect(product.name).toBe('El Cachorro');
    expect(product.slug).toBe('el-cachorro');
    expect(product.description).toBe('El primer mordisco de la manada.');
    expect(product.basePrice).toBe(14000);
    expect(product.imageUrl).toBe('https://cdn.test/cachorro.png');
    expect(product.isAvailable).toBe(true);
    expect(product.isFeatured).toBe(false);
    expect(product.isCombo).toBe(false);

    expect(product.modifierGroups).toHaveLength(1);
    const group = product.modifierGroups[0];
    expect(group.slug).toBe('ingredients');
    expect(group.name).toBe('Ingredientes');
    expect(group.minSelect).toBe(0);
    expect(group.maxSelect).toBeNull();

    expect(group.options).toHaveLength(2);
    const [mozzarella, pan] = group.options;
    expect(mozzarella.name).toBe('Queso mozzarella');
    expect(mozzarella.extraPrice).toBe(3500);
    expect(mozzarella.includedByDefault).toBe(true);
    expect(mozzarella.isRemovable).toBe(true);
    expect(mozzarella.isAvailable).toBe(true);
    expect(mozzarella.isReplaceable).toBe(true);
    expect(mozzarella.isReplacementEligible).toBe(true);
    expect(mozzarella.isEssential).toBe(false);
    expect(pan.name).toBe('Pan');
    expect(pan.extraPrice).toBe(0);
    expect(pan.includedByDefault).toBe(false);
    expect(pan.isRemovable).toBe(false);
    // Flags de reemplazo en false viajan al response (no solo el default).
    expect(pan.isReplaceable).toBe(false);
    expect(pan.isReplacementEligible).toBe(false);
    // El flag esencial en true viaja al response.
    expect(pan.isEssential).toBe(true);
  });

  it('categoría sin productos → products: []', async () => {
    const ds = app.get(DataSource);
    await ds.getRepository(Category).save({
      name: 'Bebidas',
      slug: 'bebidas',
      sortOrder: 2,
    });

    const res = await request(app.getHttpServer() as App)
      .get('/catalog')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);

    const body = res.body as {
      categories: { slug: string; products: unknown[] }[];
    };
    const bebidas = body.categories.find((c) => c.slug === 'bebidas');
    expect(bebidas).toBeDefined();
    expect(bebidas!.products).toEqual([]);
  });

  it('producto isAvailable=false llega en el response con su flag', async () => {
    const ds = app.get(DataSource);
    const category = await ds.getRepository(Category).save({
      name: 'Perros',
      slug: 'perros',
      sortOrder: 0,
    });
    await ds.getRepository(Product).save({
      categoryId: category.id,
      name: 'El Agotado',
      slug: 'el-agotado',
      basePrice: 15000,
      isAvailable: false,
      sortOrder: 0,
    });

    const res = await request(app.getHttpServer() as App)
      .get('/catalog')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);

    const body = res.body as {
      categories: { products: { name: string; isAvailable: boolean }[] }[];
    };
    const product = body.categories[0].products[0];
    expect(product.name).toBe('El Agotado');
    expect(product.isAvailable).toBe(false);
  });

  // §027 — rail de Combos: solo activas, por sort_order, con display
  // formateado por kind (la app no interpreta la mecánica).
  it('promotions: activas por sort_order con display por kind; inactiva no viaja', async () => {
    await seedMenu();
    const ds = app.get(DataSource);
    const perroId = (
      await ds.query<{ id: string }[]>(
        `SELECT id FROM products WHERE slug = 'el-cachorro'`,
      )
    )[0].id;
    // El menú del spec no trae papas — un uuid fijo (no el literal
    // 'papas': products.id es uuid y el motor de promos consulta por
    // él al crear pedidos en este mismo DB de test).
    const PAPAS_ID = 'ca7a1090-0000-4000-8000-000000000231';
    const papasId =
      (
        await ds.query<{ id: string }[]>(
          `SELECT id FROM products WHERE slug = 'papas' LIMIT 1`,
        )
      )[0]?.id ?? PAPAS_ID;
    await ds.getRepository(Promotion).save([
      {
        slug: 'papas-gratis',
        name: 'Papas Gratis',
        tagline: 'Con 2 o 3 perros, las papas van de la casa.',
        kind: PromotionKind.FREE_ITEM,
        sortOrder: 1,
        config: {
          eligibleProductIds: [perroId],
          minQty: 2,
          maxQty: 3,
          freeProductId: papasId,
          freeQty: 1,
        },
      },
      {
        slug: 'combo-cachorro',
        name: 'Combo Cachorro',
        tagline: 'Un antojo bien cazado.',
        kind: PromotionKind.FIXED_BUNDLE,
        sortOrder: 0,
        config: {
          items: [
            { productId: perroId, qty: 1 },
            { productId: PAPAS_ID, qty: 1 },
          ],
          price: 17000,
        },
      },
      {
        slug: 'manada-15',
        name: 'Manada −15%',
        tagline: 'Cuatro perros o más: la manada descuenta.',
        kind: PromotionKind.PERCENT_OFF,
        sortOrder: 3,
        config: {
          eligibleProductIds: [perroId],
          minQty: 4,
          percent: 15,
          roundDownTo: 500,
        },
      },
      {
        slug: 'promo-apagada',
        name: 'Apagada',
        tagline: null,
        kind: PromotionKind.SHOWCASE,
        sortOrder: 2,
        isActive: false,
        config: { priceLabel: '$0' },
      },
    ]);

    const res = await request(app.getHttpServer() as App)
      .get('/catalog')
      .expect(200);

    const body = res.body as {
      promotions: {
        slug: string;
        name: string;
        tagline: string | null;
        kind: string;
        sortOrder: number;
        display: {
          priceLabel: string | null;
          componentProductIds?: string[];
          eligibleProductIds?: string[];
          freeProductId?: string;
        };
      }[];
    };
    // sort_order manda en el rail; la inactiva no viaja.
    expect(body.promotions.map((p) => p.slug)).toEqual([
      'combo-cachorro',
      'papas-gratis',
      'manada-15',
    ]);

    const combo = body.promotions[0];
    expect(combo.kind).toBe('fixed_bundle');
    expect(combo.tagline).toBe('Un antojo bien cazado.');
    expect(combo.display.priceLabel).toBe('$17.000');
    expect(combo.display.componentProductIds).toEqual([perroId, PAPAS_ID]);

    const gratis = body.promotions[1];
    expect(gratis.kind).toBe('free_item');
    // "desde" = minQty × elegible ordenable más barato (14.000 × 2).
    expect(gratis.display.priceLabel).toBe('desde $28.000');
    expect(gratis.display.eligibleProductIds).toEqual([perroId]);
    expect(gratis.display.freeProductId).toBe(papasId);

    const manada = body.promotions[2];
    expect(manada.kind).toBe('percent_off');
    expect(manada.display.priceLabel).toBe('−15%');
    expect(manada.display.eligibleProductIds).toEqual([perroId]);
  });
});
