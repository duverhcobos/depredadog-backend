import { CatalogMapper } from './catalog.mapper';
import { Category } from '../../domain/entities/category.entity';
import { ModifierGroup } from '../../domain/entities/modifier-group.entity';
import { ModifierOption } from '../../domain/entities/modifier-option.entity';
import { Product } from '../../domain/entities/product.entity';
import { ProductImage } from '../../domain/entities/product-image.entity';
import { Promotion } from '../../../promotions/domain/entities/promotion.entity';
import { PromotionKind } from '../../../promotions/domain/enums/promotion-kind.enum';
import { CatalogResult } from '../use-cases/get-catalog.use-case';

describe('CatalogMapper', () => {
  const mapper = new CatalogMapper();

  function result(
    categories: Category[],
    promotions: Promotion[] = [],
    productBasePrices = new Map<string, number>(),
  ): CatalogResult {
    return { categories, promotions, productBasePrices };
  }

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

    const dto = mapper.toCatalogResponse(result([categoryWith([p])]));

    expect(dto.categories[0].products[0].imageUrl).toBe('primary.png');
  });

  it('imageUrl = null cuando el producto no tiene imágenes', () => {
    const p = new Product();
    p.id = 'p1';
    p.name = 'El Cachorro';
    p.basePrice = 14000;
    p.images = [];
    p.modifierGroups = [];

    const dto = mapper.toCatalogResponse(result([categoryWith([p])]));

    expect(dto.categories[0].products[0].imageUrl).toBeNull();
  });

  it('mapea flags completos: includedByDefault, isRemovable, flags de reemplazo/esencial y maxSelect null', () => {
    const option = new ModifierOption();
    option.id = 'o1';
    option.name = 'Pan';
    option.extraPrice = 0;
    option.isAvailable = true;
    option.includedByDefault = true;
    option.isRemovable = false;
    option.isReplaceable = false;
    option.isReplacementEligible = false;
    option.isEssential = true;
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

    const dto = mapper.toCatalogResponse(result([categoryWith([p])]));
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
      isEssential: true,
    });
  });

  // §027 — el rail de Combos: display formateado por kind, sin que la
  // app interprete la mecánica.
  describe('promotions', () => {
    function promo(kind: PromotionKind, config: object): Promotion {
      const p = new Promotion();
      p.slug = 'p-' + kind;
      p.name = 'Promo ' + kind;
      p.tagline = 'Tagline';
      p.kind = kind;
      p.config = config;
      p.isActive = true;
      p.sortOrder = 0;
      return p;
    }

    it('fixed_bundle → priceLabel "$17.000" + componentProductIds expandido por qty', () => {
      const dto = mapper.toCatalogResponse(
        result(
          [],
          [
            promo(PromotionKind.FIXED_BUNDLE, {
              items: [
                { productId: 'p-cachorro', qty: 1 },
                { productId: 'p-papas', qty: 2 },
              ],
              price: 17000,
            }),
          ],
        ),
      );

      const card = dto.promotions[0];
      expect(card.slug).toBe('p-fixed_bundle');
      expect(card.kind).toBe('fixed_bundle');
      expect(card.display.priceLabel).toBe('$17.000');
      expect(card.display.componentProductIds).toEqual([
        'p-cachorro',
        'p-papas',
        'p-papas',
      ]);
      // §046 — config cruda para el evaluador local del carrito.
      expect(card.config).toEqual({
        items: [
          { productId: 'p-cachorro', qty: 1 },
          { productId: 'p-papas', qty: 2 },
        ],
        price: 17000,
      });
    });

    it('free_item → "desde $X" con el elegible ordenable más barato × minQty', () => {
      const dto = mapper.toCatalogResponse(
        result(
          [],
          [
            promo(PromotionKind.FREE_ITEM, {
              eligibleProductIds: ['d1', 'd2', 'd3'],
              minQty: 2,
              maxQty: 3,
              freeProductId: 'p-papas',
              freeQty: 1,
            }),
          ],
          new Map([
            ['d1', 16000],
            ['d2', 14000],
            // d3 no es ordenable — no entra al "desde".
          ]),
        ),
      );

      const display = dto.promotions[0].display;
      expect(display.priceLabel).toBe('desde $28.000');
      expect(display.eligibleProductIds).toEqual(['d1', 'd2', 'd3']);
      expect(display.freeProductId).toBe('p-papas');
    });

    it('free_item sin elegibles ordenables → priceLabel null', () => {
      const dto = mapper.toCatalogResponse(
        result(
          [],
          [
            promo(PromotionKind.FREE_ITEM, {
              eligibleProductIds: ['d1'],
              minQty: 2,
              freeProductId: 'p-papas',
              freeQty: 1,
            }),
          ],
          new Map(),
        ),
      );
      expect(dto.promotions[0].display.priceLabel).toBeNull();
    });

    it('percent_off → "−15%" + eligibleProductIds', () => {
      const dto = mapper.toCatalogResponse(
        result(
          [],
          [
            promo(PromotionKind.PERCENT_OFF, {
              eligibleProductIds: ['d1'],
              minQty: 4,
              percent: 15,
              roundDownTo: 500,
            }),
          ],
        ),
      );
      expect(dto.promotions[0].display.priceLabel).toBe('−15%');
      expect(dto.promotions[0].display.eligibleProductIds).toEqual(['d1']);
    });

    it('showcase → priceLabel del config + componentProductIds', () => {
      const dto = mapper.toCatalogResponse(
        result(
          [],
          [
            promo(PromotionKind.SHOWCASE, {
              items: [{ productId: 'd-dep', qty: 2 }],
              priceLabel: '$36.000',
            }),
          ],
        ),
      );
      const display = dto.promotions[0].display;
      expect(display.priceLabel).toBe('$36.000');
      expect(display.componentProductIds).toEqual(['d-dep', 'd-dep']);
    });
  });
});
