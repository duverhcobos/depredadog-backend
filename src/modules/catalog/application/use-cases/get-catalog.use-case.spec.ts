import { Test } from '@nestjs/testing';
import { Category } from '../../domain/entities/category.entity';
import { Product } from '../../domain/entities/product.entity';
import { Promotion } from '../../../promotions/domain/entities/promotion.entity';
import { PromotionKind } from '../../../promotions/domain/enums/promotion-kind.enum';
import {
  IPromotionRepository,
  PROMOTION_REPOSITORY,
} from '../../../promotions/domain/repositories/promotion.repository.interface';
import {
  ICatalogRepository,
  CATALOG_REPOSITORY,
} from '../../domain/repositories/catalog.repository.interface';
import { GetCatalogUseCase } from './get-catalog.use-case';

describe('GetCatalogUseCase', () => {
  let useCase: GetCatalogUseCase;
  let catalog: jest.Mocked<ICatalogRepository>;
  let promotions: jest.Mocked<IPromotionRepository>;

  function promo(kind: PromotionKind, config: object): Promotion {
    const p = new Promotion();
    p.slug = 'p-' + kind;
    p.name = 'Promo';
    p.kind = kind;
    p.config = config;
    p.isActive = true;
    p.sortOrder = 0;
    return p;
  }

  beforeEach(async () => {
    catalog = {
      getMenu: jest.fn(),
      getOrderableProducts: jest.fn(),
    };
    promotions = {
      findActive: jest.fn(),
    };
    catalog.getMenu.mockResolvedValue([]);
    promotions.findActive.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        GetCatalogUseCase,
        { provide: CATALOG_REPOSITORY, useValue: catalog },
        { provide: PROMOTION_REPOSITORY, useValue: promotions },
      ],
    }).compile();
    useCase = module.get(GetCatalogUseCase);
  });

  it('devuelve categorías + promociones; sin free_item no consulta precios', async () => {
    const categories = [new Category(), new Category()];
    catalog.getMenu.mockResolvedValue(categories);
    promotions.findActive.mockResolvedValue([
      promo(PromotionKind.SHOWCASE, { priceLabel: '$36.000' }),
    ]);

    const result = await useCase.execute();

    expect(result.categories).toBe(categories);
    expect(result.promotions).toHaveLength(1);
    expect(result.productBasePrices.size).toBe(0);
    expect(catalog.getOrderableProducts).not.toHaveBeenCalled();
  });

  it('menú vacío → arrays vacíos sin lanzar excepción', async () => {
    const result = await useCase.execute();
    expect(result.categories).toEqual([]);
    expect(result.promotions).toEqual([]);
  });

  // §027 — el "desde $X" de las cards free_item se arma con precios
  // reales de los elegibles ordenables.
  it('free_item → consulta precios de sus elegibles (deduplicados)', async () => {
    promotions.findActive.mockResolvedValue([
      promo(PromotionKind.FREE_ITEM, {
        eligibleProductIds: ['d1', 'd2', 'd3'],
        minQty: 2,
        freeProductId: 'p-papas',
        freeQty: 1,
      }),
      promo(PromotionKind.FREE_ITEM, {
        eligibleProductIds: ['d2', 'd4'],
        minQty: 2,
        freeProductId: 'p-otro',
        freeQty: 1,
      }),
      // percent_off también lista elegibles pero su label no usa precio.
      promo(PromotionKind.PERCENT_OFF, {
        eligibleProductIds: ['d9'],
        minQty: 4,
        percent: 15,
        roundDownTo: 500,
      }),
    ]);
    const prod = (id: string, basePrice: number): Product => {
      const p = new Product();
      p.id = id;
      p.basePrice = basePrice;
      return p;
    };
    catalog.getOrderableProducts.mockResolvedValue([
      prod('d1', 14000),
      prod('d4', 16000),
    ]);

    const result = await useCase.execute();

    expect(catalog.getOrderableProducts).toHaveBeenCalledWith([
      'd1',
      'd2',
      'd3',
      'd4',
    ]);
    expect(result.productBasePrices).toEqual(
      new Map([
        ['d1', 14000],
        ['d4', 16000],
      ]),
    );
  });
});
