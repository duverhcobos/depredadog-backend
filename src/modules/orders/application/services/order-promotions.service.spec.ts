import { Product } from '../../../catalog/domain/entities/product.entity';
import { ICatalogRepository } from '../../../catalog/domain/repositories/catalog.repository.interface';
import { Promotion } from '../../../promotions/domain/entities/promotion.entity';
import { PromotionKind } from '../../../promotions/domain/enums/promotion-kind.enum';
import { IPromotionRepository } from '../../../promotions/domain/repositories/promotion.repository.interface';
import { PromotionEvaluator } from '../../../promotions/domain/services/promotion-evaluator.service';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { OrderCatalogViolationException } from '../../domain/exceptions/order-catalog-violation.exception';
import { OrderItemsBuilder } from '../../domain/services/order-items-builder.service';
import { OrderPromotionsApplier } from './order-promotions.service';

describe('OrderPromotionsApplier (§027)', () => {
  let catalog: jest.Mocked<ICatalogRepository>;
  let promotions: jest.Mocked<IPromotionRepository>;
  let itemsBuilder: { build: jest.Mock };
  let applier: OrderPromotionsApplier;

  const DOGS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
  // products.id es uuid — el freeProductId del seed también lo es.
  const PAPAS = 'ca7a1090-0000-4000-8000-000000000231';

  function promo(config: object): Promotion {
    const p = new Promotion();
    p.slug = 'papas-gratis';
    p.name = 'Papas Gratis';
    p.kind = PromotionKind.FREE_ITEM;
    p.config = config;
    p.isActive = true;
    p.sortOrder = 0;
    return p;
  }

  function item(productId: string, quantity: number, price: number): OrderItem {
    const i = new OrderItem();
    i.productId = productId;
    i.productName = productId;
    i.unitPrice = price;
    i.quantity = quantity;
    i.lineTotal = price * quantity;
    i.modifiers = [];
    return i;
  }

  function product(id: string, basePrice: number): Product {
    const p = new Product();
    p.id = id;
    p.basePrice = basePrice;
    return p;
  }

  beforeEach(() => {
    catalog = { getMenu: jest.fn(), getOrderableProducts: jest.fn() };
    promotions = { findActive: jest.fn() };
    itemsBuilder = { build: jest.fn() };
    applier = new OrderPromotionsApplier(
      catalog,
      promotions,
      new PromotionEvaluator(),
      itemsBuilder as unknown as OrderItemsBuilder,
    );
    catalog.getOrderableProducts.mockResolvedValue([]);
  });

  it('sin promos activas → pass-through sin consultar precios ni construir', async () => {
    promotions.findActive.mockResolvedValue([]);
    const items = [item('d1', 1, 14000)];

    const r = await applier.apply(items);

    expect(r).toEqual({ items, discount: 0, appliedPromotions: [] });
    expect(catalog.getOrderableProducts).not.toHaveBeenCalled();
    expect(itemsBuilder.build).not.toHaveBeenCalled();
  });

  it('free_item con regalo ausente → pide su precio al catálogo y lo construye con el builder', async () => {
    promotions.findActive.mockResolvedValue([
      promo({
        eligibleProductIds: DOGS,
        minQty: 2,
        maxQty: 3,
        freeProductId: PAPAS,
        freeQty: 1,
      }),
    ]);
    catalog.getOrderableProducts.mockResolvedValue([product(PAPAS, 5000)]);
    const injected = item(PAPAS, 1, 5000);
    itemsBuilder.build.mockResolvedValue([injected]);

    const r = await applier.apply([item('d1', 2, 14000)]);

    expect(catalog.getOrderableProducts).toHaveBeenCalledWith([PAPAS]);
    expect(itemsBuilder.build).toHaveBeenCalledWith([
      { productId: PAPAS, quantity: 1, modifiers: [] },
    ]);
    expect(r.items).toHaveLength(2);
    expect(r.items[1]).toBe(injected);
    expect(r.discount).toBe(5000);
    expect(r.appliedPromotions).toEqual([
      { slug: 'papas-gratis', name: 'Papas Gratis', saving: 5000 },
    ]);
  });

  it('freeProduct agotado/no ordenable → la promo no dispara (no hay inyección ni 409)', async () => {
    promotions.findActive.mockResolvedValue([
      promo({
        eligibleProductIds: DOGS,
        minQty: 2,
        freeProductId: PAPAS,
        freeQty: 1,
      }),
    ]);
    catalog.getOrderableProducts.mockResolvedValue([]); // papas agotada

    const r = await applier.apply([item('d1', 2, 14000)]);

    expect(r.items).toHaveLength(1);
    expect(r.discount).toBe(0);
    expect(r.appliedPromotions).toEqual([]);
    expect(itemsBuilder.build).not.toHaveBeenCalled();
  });

  it('si el builder falla construyendo el regalo → retira la promo completa, no tumba el pedido', async () => {
    promotions.findActive.mockResolvedValue([
      promo({
        eligibleProductIds: DOGS,
        minQty: 2,
        freeProductId: PAPAS,
        freeQty: 1,
      }),
    ]);
    catalog.getOrderableProducts.mockResolvedValue([product(PAPAS, 5000)]);
    itemsBuilder.build.mockRejectedValue(
      new OrderCatalogViolationException('product papas unavailable'),
    );

    const r = await applier.apply([item('d1', 2, 14000)]);

    expect(r.items).toHaveLength(1);
    expect(r.discount).toBe(0);
    expect(r.appliedPromotions).toEqual([]);
  });

  it('regalo ya pedido → deriva el base de la línea, sin query ni inyección', async () => {
    promotions.findActive.mockResolvedValue([
      promo({
        eligibleProductIds: DOGS,
        minQty: 2,
        freeProductId: PAPAS,
        freeQty: 1,
      }),
    ]);

    const r = await applier.apply([item('d1', 2, 14000), item(PAPAS, 1, 5000)]);

    expect(catalog.getOrderableProducts).not.toHaveBeenCalled();
    expect(itemsBuilder.build).not.toHaveBeenCalled();
    expect(r.items).toHaveLength(2);
    expect(r.discount).toBe(5000);
  });

  it('freeProductId mal configurado (no uuid) → no consulta el cast ni dispara la promo', async () => {
    promotions.findActive.mockResolvedValue([
      promo({
        eligibleProductIds: DOGS,
        minQty: 2,
        maxQty: 3,
        freeProductId: 'papas', // literal suelto — products.id es uuid
        freeQty: 1,
      }),
    ]);

    const r = await applier.apply([item('d1', 2, 14000)]);

    expect(catalog.getOrderableProducts).not.toHaveBeenCalled();
    expect(itemsBuilder.build).not.toHaveBeenCalled();
    expect(r.items).toHaveLength(1);
    expect(r.discount).toBe(0);
    expect(r.appliedPromotions).toEqual([]);
  });
});
