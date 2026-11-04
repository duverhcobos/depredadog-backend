import { CatalogMapper } from './catalog.mapper';
import { Category } from '../../domain/entities/category.entity';
import { ModifierGroup } from '../../domain/entities/modifier-group.entity';
import { ModifierOption } from '../../domain/entities/modifier-option.entity';
import { Product } from '../../domain/entities/product.entity';
import { ProductImage } from '../../domain/entities/product-image.entity';

describe('CatalogMapper', () => {
  const mapper = new CatalogMapper();

  function image(url: string, isPrimary: boolean): ProductImage {
    const i = new ProductImage();
    i.imageUrl = url;
    i.isPrimary = isPrimary;
    return i;
  }

  function categoryWith(products: Product[]): Category {
    const c = new Category();
    c.id = 'c1';
    c.slug = 'perros';
    c.name = 'Perros';
    c.sortOrder = 0;
    c.products = products;
    return c;
  }

  it('imageUrl = la imagen isPrimary', () => {
    const p = new Product();
    p.id = 'p1';
    p.name = 'El Cachorro';
    p.basePrice = 14000;
    p.images = [image('secondary.png', false), image('primary.png', true)];
    p.modifierGroups = [];

    const dto = mapper.toCatalogResponse([categoryWith([p])]);

    expect(dto.categories[0].products[0].imageUrl).toBe('primary.png');
  });

  it('imageUrl = null cuando el producto no tiene imágenes', () => {
    const p = new Product();
    p.id = 'p1';
    p.name = 'El Cachorro';
    p.basePrice = 14000;
    p.images = [];
    p.modifierGroups = [];

    const dto = mapper.toCatalogResponse([categoryWith([p])]);

    expect(dto.categories[0].products[0].imageUrl).toBeNull();
  });

  it('mapea flags completos: includedByDefault, isRemovable, flags de reemplazo y maxSelect null', () => {
    const option = new ModifierOption();
    option.id = 'o1';
    option.name = 'Pan';
    option.extraPrice = 0;
    option.isAvailable = true;
    option.includedByDefault = true;
    option.isRemovable = false;
    option.isReplaceable = false;
    option.isReplacementEligible = false;
    option.sortOrder = -1;

    const group = new ModifierGroup();
    group.id = 'g1';
    group.slug = 'ingredients';
    group.name = 'Ingredientes';
    group.minSelect = 0;
    group.maxSelect = null;
    group.options = [option];

    const p = new Product();
    p.id = 'p1';
    p.name = 'El Cachorro';
    p.description = null;
    p.basePrice = 14000;
    p.images = [];
    p.modifierGroups = [group];

    const dto = mapper.toCatalogResponse([categoryWith([p])]);
    const product = dto.categories[0].products[0];

    expect(product.description).toBeNull();
    expect(product.isAvailable).toBe(true);
    expect(product.isFeatured).toBe(false);
    expect(product.isCombo).toBe(false);
    expect(product.modifierGroups[0].maxSelect).toBeNull();
    const mapped = product.modifierGroups[0].options[0];
    expect(mapped).toEqual({
      id: 'o1',
      name: 'Pan',
      extraPrice: 0,
      isAvailable: true,
      includedByDefault: true,
      isRemovable: false,
      sortOrder: -1,
      isReplaceable: false,
      isReplacementEligible: false,
    });
  });
});
