import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { Category } from '../../domain/entities/category.entity';
import { ModifierGroup } from '../../domain/entities/modifier-group.entity';
import { ModifierOption } from '../../domain/entities/modifier-option.entity';
import { Product } from '../../domain/entities/product.entity';
import { ProductImage } from '../../domain/entities/product-image.entity';
import { ProductModifierGroup } from '../../domain/entities/product-modifier-group.entity';
import { ProductModifierOption } from '../../domain/entities/product-modifier-option.entity';
import { CatalogRepository } from './catalog.repository';

describe('CatalogRepository', () => {
  let repo: CatalogRepository;
  let categories: jest.Mocked<Repository<Category>>;
  let products: jest.Mocked<Repository<Product>>;
  let images: jest.Mocked<Repository<ProductImage>>;
  let productGroups: jest.Mocked<Repository<ProductModifierGroup>>;
  let groups: jest.Mocked<Repository<ModifierGroup>>;
  let options: jest.Mocked<Repository<ModifierOption>>;
  let productOptions: jest.Mocked<Repository<ProductModifierOption>>;

  function orm<T extends ObjectLiteral>(): jest.Mocked<Repository<T>> {
    return { find: jest.fn() } as unknown as jest.Mocked<Repository<T>>;
  }

  function category(id: string): Category {
    const c = new Category();
    c.id = id;
    c.isActive = true;
    c.sortOrder = 0;
    return c;
  }

  function product(id: string, categoryId: string): Product {
    const p = new Product();
    p.id = id;
    p.categoryId = categoryId;
    return p;
  }

  beforeEach(async () => {
    categories = orm();
    products = orm();
    images = orm();
    productGroups = orm();
    groups = orm();
    options = orm();
    productOptions = orm();
    const module = await Test.createTestingModule({
      providers: [
        CatalogRepository,
        { provide: getRepositoryToken(Category), useValue: categories },
        { provide: getRepositoryToken(Product), useValue: products },
        { provide: getRepositoryToken(ProductImage), useValue: images },
        {
          provide: getRepositoryToken(ProductModifierGroup),
          useValue: productGroups,
        },
        { provide: getRepositoryToken(ModifierGroup), useValue: groups },
        { provide: getRepositoryToken(ModifierOption), useValue: options },
        {
          provide: getRepositoryToken(ProductModifierOption),
          useValue: productOptions,
        },
      ],
    }).compile();
    repo = module.get(CatalogRepository);
  });

  it('categorías vacías → [] sin consultar productos', async () => {
    categories.find.mockResolvedValue([]);
    const result = await repo.getMenu();
    expect(result).toEqual([]);
    expect(products.find).not.toHaveBeenCalled();
  });

  it('sin productos → categorías con products: [] sin consultar modificadores', async () => {
    categories.find.mockResolvedValue([category('c1')]);
    products.find.mockResolvedValue([]);
    const result = await repo.getMenu();
    expect(result).toHaveLength(1);
    expect(result[0].products).toEqual([]);
    expect(images.find).not.toHaveBeenCalled();
    expect(productGroups.find).not.toHaveBeenCalled();
    expect(productOptions.find).not.toHaveBeenCalled();
    expect(groups.find).not.toHaveBeenCalled();
    expect(options.find).not.toHaveBeenCalled();
  });

  it('ensambla el árbol: opciones por grupo e includedByDefault por producto', async () => {
    categories.find.mockResolvedValue([category('c1')]);
    products.find.mockResolvedValue([product('p1', 'c1'), product('p2', 'c1')]);

    const image = new ProductImage();
    image.id = 'i1';
    image.productId = 'p1';
    image.isPrimary = true;
    images.find.mockResolvedValue([image]);

    const linkP1 = new ProductModifierGroup();
    linkP1.productId = 'p1';
    linkP1.groupId = 'g1';
    const linkP2 = new ProductModifierGroup();
    linkP2.productId = 'p2';
    linkP2.groupId = 'g1';
    productGroups.find.mockResolvedValue([linkP1, linkP2]);

    // o1 es default en p1 pero adicional en p2 (misma opción compartida).
    const def = new ProductModifierOption();
    def.productId = 'p1';
    def.optionId = 'o1';
    def.includedByDefault = true;
    productOptions.find.mockResolvedValue([def]);

    const group = new ModifierGroup();
    group.id = 'g1';
    group.slug = 'ingredients';
    groups.find.mockResolvedValue([group]);

    const o1 = new ModifierOption();
    o1.id = 'o1';
    o1.groupId = 'g1';
    const o2 = new ModifierOption();
    o2.id = 'o2';
    o2.groupId = 'g1';
    options.find.mockResolvedValue([o1, o2]);

    const result = await repo.getMenu();

    expect(result[0].products).toHaveLength(2);
    const [p1, p2] = result[0].products;
    expect(p1.images).toHaveLength(1);
    expect(p1.modifierGroups).toHaveLength(1);
    expect(p1.modifierGroups[0].options).toHaveLength(2);
    expect(p1.modifierGroups[0].options[0].includedByDefault).toBe(true);
    expect(p1.modifierGroups[0].options[1].includedByDefault).toBe(false);
    // Misma opción en p2: no es default allí.
    expect(p2.modifierGroups[0].options[0].includedByDefault).toBe(false);
    expect(p2.images).toEqual([]);
  });

  it('el sort_order de product_modifier_options pisa el global para ese producto', async () => {
    categories.find.mockResolvedValue([category('c1')]);
    products.find.mockResolvedValue([product('p1', 'c1')]);
    images.find.mockResolvedValue([]);

    const link = new ProductModifierGroup();
    link.productId = 'p1';
    link.groupId = 'g1';
    productGroups.find.mockResolvedValue([link]);

    // o2 es default en p1 con sort_order propio que pisa el global.
    const def = new ProductModifierOption();
    def.productId = 'p1';
    def.optionId = 'o2';
    def.includedByDefault = true;
    def.sortOrder = 0;
    productOptions.find.mockResolvedValue([def]);

    const group = new ModifierGroup();
    group.id = 'g1';
    groups.find.mockResolvedValue([group]);

    const o1 = new ModifierOption();
    o1.id = 'o1';
    o1.groupId = 'g1';
    o1.sortOrder = 1;
    const o2 = new ModifierOption();
    o2.id = 'o2';
    o2.groupId = 'g1';
    o2.sortOrder = 2;
    options.find.mockResolvedValue([o1, o2]);

    const result = await repo.getMenu();
    const ids = result[0].products[0].modifierGroups[0].options.map(
      (o) => o.id,
    );
    expect(ids).toEqual(['o2', 'o1']);
  });

  it('producto sin grupos enlazados → modifierGroups: []', async () => {
    categories.find.mockResolvedValue([category('c1')]);
    products.find.mockResolvedValue([product('p1', 'c1')]);
    images.find.mockResolvedValue([]);
    productGroups.find.mockResolvedValue([]);
    productOptions.find.mockResolvedValue([]);

    const result = await repo.getMenu();

    expect(result[0].products[0].modifierGroups).toEqual([]);
    expect(groups.find).not.toHaveBeenCalled();
    expect(options.find).not.toHaveBeenCalled();
  });

  it('ordena modifierGroups por sort_order del grupo, no por orden de links', async () => {
    categories.find.mockResolvedValue([category('c1')]);
    products.find.mockResolvedValue([product('p1', 'c1')]);
    images.find.mockResolvedValue([]);

    // Links llegan invertidos (sin ORDER BY en la junction).
    const link1 = new ProductModifierGroup();
    link1.productId = 'p1';
    link1.groupId = 'g-sauces';
    const link2 = new ProductModifierGroup();
    link2.productId = 'p1';
    link2.groupId = 'g-ingredients';
    productGroups.find.mockResolvedValue([link1, link2]);
    productOptions.find.mockResolvedValue([]);

    const sauces = new ModifierGroup();
    sauces.id = 'g-sauces';
    sauces.slug = 'sauces';
    sauces.sortOrder = 2;
    const ingredients = new ModifierGroup();
    ingredients.id = 'g-ingredients';
    ingredients.slug = 'ingredients';
    ingredients.sortOrder = 0;
    groups.find.mockResolvedValue([sauces, ingredients]);
    options.find.mockResolvedValue([]);

    const result = await repo.getMenu();
    const slugs = result[0].products[0].modifierGroups.map((g) => g.slug);
    expect(slugs).toEqual(['ingredients', 'sauces']);
  });
});
