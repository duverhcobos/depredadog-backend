import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Address } from '../../../auth/domain/entities/address.entity';
import { AddressNotFoundException } from '../../../auth/domain/exceptions/address-not-found.exception';
import {
  IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../../auth/domain/repositories/address.repository.interface';
import { ModifierGroup } from '../../../catalog/domain/entities/modifier-group.entity';
import { ModifierOption } from '../../../catalog/domain/entities/modifier-option.entity';
import { Product } from '../../../catalog/domain/entities/product.entity';
import {
  ICatalogRepository,
  CATALOG_REPOSITORY,
} from '../../../catalog/domain/repositories/catalog.repository.interface';
import { PaymentStatus } from '../../../payments/domain/enums/payment-status.enum';
import { PaymentDispatchFailedException } from '../../../payments/domain/exceptions/payment-dispatch-failed.exception';
import {
  IPaymentGateway,
  PAYMENT_GATEWAY,
} from '../../../payments/domain/services/payment-gateway.interface';
import { BusinessHour } from '../../../store/domain/entities/business-hour.entity';
import { StoreSettings } from '../../../store/domain/entities/store-settings.entity';
import {
  IStoreRepository,
  STORE_REPOSITORY,
} from '../../../store/domain/repositories/store.repository.interface';
import { Order } from '../../domain/entities/order.entity';
import { ModifierAction } from '../../domain/enums/modifier-action.enum';
import { OrderChannel } from '../../domain/enums/order-channel.enum';
import { OrderServiceType } from '../../domain/enums/order-service-type.enum';
import { InvalidOrderDataException } from '../../domain/exceptions/invalid-order-data.exception';
import { MinOrderAmountException } from '../../domain/exceptions/min-order-amount.exception';
import { OrderCatalogViolationException } from '../../domain/exceptions/order-catalog-violation.exception';
import { StoreClosedException } from '../../domain/exceptions/store-closed.exception';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { OrderItemsBuilder } from '../../domain/services/order-items-builder.service';
import {
  CreateOrderCommand,
  CreateOrderUseCase,
} from './create-order.use-case';

function settings(overrides: Partial<StoreSettings> = {}): StoreSettings {
  const s = new StoreSettings();
  s.id = 'st1';
  s.name = 'Depredadog';
  s.deliveryFee = 2000;
  s.minDeliveryOrder = 10000;
  Object.assign(s, overrides);
  return s;
}

// 00:00→00:00 (rango cruzado 24h) los 7 días — abierto siempre,
// determinista sin importar cuándo corra el spec.
function openHours(): BusinessHour[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const h = new BusinessHour();
    h.dayOfWeek = d;
    h.opensAt = '00:00';
    h.closesAt = '00:00';
    h.isClosed = false;
    return h;
  });
}

function closedHours(): BusinessHour[] {
  return openHours().map((h) => {
    const c = new BusinessHour();
    Object.assign(c, h, { isClosed: true });
    return c;
  });
}

function product(id: string, overrides: Partial<Product> = {}): Product {
  const p = new Product();
  p.id = id;
  p.categoryId = 'c1';
  p.name = `Producto ${id}`;
  p.slug = id;
  p.basePrice = 14000;
  p.isAvailable = true;
  p.modifierGroups = [];
  Object.assign(p, overrides);
  return p;
}

function option(
  id: string,
  overrides: Partial<ModifierOption> = {},
): ModifierOption {
  const o = new ModifierOption();
  o.id = id;
  o.groupId = 'g1';
  o.name = `Opción ${id}`;
  o.extraPrice = 0;
  Object.assign(o, overrides);
  return o;
}

function withGroup(p: Product, options: ModifierOption[]): Product {
  const g = new ModifierGroup();
  g.id = 'g1';
  g.slug = 'ingredients';
  g.name = 'Ingredientes';
  g.options = options;
  p.modifierGroups = [g];
  return p;
}

describe('CreateOrderUseCase', () => {
  let useCase: CreateOrderUseCase;
  let orders: jest.Mocked<IOrderRepository>;
  let gateway: jest.Mocked<IPaymentGateway>;
  let catalog: jest.Mocked<ICatalogRepository>;
  let store: jest.Mocked<IStoreRepository>;
  let addresses: jest.Mocked<IAddressRepository>;

  const base: CreateOrderCommand = {
    customerId: 'u1',
    serviceType: 'pickup',
    items: [{ productId: 'p1', quantity: 1, modifiers: [] }],
    paymentMethod: 'transfer',
    payerPhone: '3001234567',
  };

  const deliveryCmd: CreateOrderCommand = {
    ...base,
    serviceType: 'delivery',
    contactPhone: '3009876543',
    newAddress: {
      landmark: 'Casa blanca frente a la cancha',
      neighborhood: 'Barrio Centro',
    },
  };

  beforeEach(async () => {
    orders = {
      findByClientRequest: jest.fn(),
      createAggregate: jest.fn((o) => Promise.resolve(o)),
      findByCustomer: jest.fn(),
      findByIdForCustomer: jest.fn(),
      findByProviderReference: jest.fn(),
      cancelPendingAggregate: jest.fn(),
      resolvePaymentAggregate: jest.fn(),
      findForAdmin: jest.fn(),
      findById: jest.fn(),
      transitionStatus: jest.fn(),
      confirmPayment: jest.fn(),
      findActiveTableIds: jest.fn(),
      findUnclosedTerminal: jest.fn(),
      claimUnclosedTerminal: jest.fn(),
    };
    gateway = {
      initiatePush: jest.fn(),
    };
    catalog = {
      getMenu: jest.fn(),
      getOrderableProducts: jest.fn(),
    };
    store = {
      getSettings: jest.fn(),
      getBusinessHours: jest.fn(),
      getTables: jest.fn(),
      getTablesByIds: jest.fn(),
    };
    addresses = {
      findAllByUserId: jest.fn(),
      findByIdForUser: jest.fn(),
      countByUserId: jest.fn(),
      save: jest.fn(),
      saveAsExclusiveDefault: jest.fn(),
      delete: jest.fn(),
    };
    const config = { get: jest.fn().mockReturnValue('America/Bogota') };

    store.getSettings.mockResolvedValue(settings());
    store.getBusinessHours.mockResolvedValue(openHours());
    catalog.getOrderableProducts.mockResolvedValue([product('p1')]);
    orders.findByClientRequest.mockResolvedValue(null);
    gateway.initiatePush.mockResolvedValue({
      provider: 'sim',
      reference: 'sim-ref-1',
    });

    const module = await Test.createTestingModule({
      providers: [
        CreateOrderUseCase,
        // El builder real — la revalidación de catálogo se sigue
        // cubriendo desde este spec tras la extracción (§019).
        OrderItemsBuilder,
        { provide: ORDER_REPOSITORY, useValue: orders },
        { provide: PAYMENT_GATEWAY, useValue: gateway },
        { provide: CATALOG_REPOSITORY, useValue: catalog },
        { provide: STORE_REPOSITORY, useValue: store },
        { provide: ADDRESS_REPOSITORY, useValue: addresses },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    useCase = module.get(CreateOrderUseCase);
  });

  it('clientRequestId existente devuelve la misma orden sin crear', async () => {
    const existing = new Order();
    orders.findByClientRequest.mockResolvedValue(existing);
    const result = await useCase.execute({
      ...base,
      clientRequestId: 'req-1',
    });
    expect(result).toBe(existing);
    expect(orders.findByClientRequest).toHaveBeenCalledWith('u1', 'req-1');
    expect(orders.createAggregate).not.toHaveBeenCalled();
  });

  it('local cerrado → StoreClosedException (409)', async () => {
    store.getBusinessHours.mockResolvedValue(closedHours());
    await expect(useCase.execute(base)).rejects.toBeInstanceOf(
      StoreClosedException,
    );
    expect(orders.createAggregate).not.toHaveBeenCalled();
  });

  it('sin store_settings → StoreClosedException', async () => {
    store.getSettings.mockResolvedValue(null);
    await expect(useCase.execute(base)).rejects.toBeInstanceOf(
      StoreClosedException,
    );
  });

  it('pickup + cash → InvalidOrderDataException (400)', async () => {
    const cmd = { ...base, paymentMethod: 'cash' as const };
    delete cmd.payerPhone;
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidOrderDataException,
    );
    expect(orders.createAggregate).not.toHaveBeenCalled();
  });

  it('transfer sin payerPhone → 400', async () => {
    const cmd = { ...base };
    delete cmd.payerPhone;
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidOrderDataException,
    );
  });

  it('cash con payerPhone → 400', async () => {
    const cmd = { ...deliveryCmd, paymentMethod: 'cash' as const };
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidOrderDataException,
    );
  });

  it('delivery sin contactPhone → 400', async () => {
    const cmd = { ...deliveryCmd };
    delete cmd.contactPhone;
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidOrderDataException,
    );
  });

  it('delivery con addressId Y newAddress → 400; sin ninguno → 400', async () => {
    await expect(
      useCase.execute({ ...deliveryCmd, addressId: 'a1' }),
    ).rejects.toBeInstanceOf(InvalidOrderDataException);
    const sinNinguno = { ...deliveryCmd };
    delete sinNinguno.newAddress;
    await expect(useCase.execute(sinNinguno)).rejects.toBeInstanceOf(
      InvalidOrderDataException,
    );
  });

  it('pickup con campos de delivery → 400', async () => {
    await expect(
      useCase.execute({ ...base, deliveryLocationLink: 'https://maps/x' }),
    ).rejects.toBeInstanceOf(InvalidOrderDataException);
    await expect(
      useCase.execute({ ...base, addressId: 'a1' }),
    ).rejects.toBeInstanceOf(InvalidOrderDataException);
  });

  it('addressId ajeno/inexistente → AddressNotFoundException (404)', async () => {
    addresses.findByIdForUser.mockResolvedValue(null);
    const cmd = { ...deliveryCmd, addressId: 'a-ajena' };
    delete cmd.newAddress;
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      AddressNotFoundException,
    );
    expect(addresses.findByIdForUser).toHaveBeenCalledWith('a-ajena', 'u1');
  });

  it('producto inexistente o agotado → OrderCatalogViolationException (409)', async () => {
    catalog.getOrderableProducts.mockResolvedValue([]);
    await expect(useCase.execute(base)).rejects.toBeInstanceOf(
      OrderCatalogViolationException,
    );
    catalog.getOrderableProducts.mockResolvedValue([
      product('p1', { isAvailable: false }),
    ]);
    await expect(useCase.execute(base)).rejects.toBeInstanceOf(
      OrderCatalogViolationException,
    );
  });

  it('opción incluida ESENCIAL agotada → producto agotado (409)', async () => {
    const salchicha = option('o-ess', {
      includedByDefault: true,
      isEssential: true,
      isAvailable: false,
    });
    catalog.getOrderableProducts.mockResolvedValue([
      withGroup(product('p1'), [salchicha]),
    ]);
    await expect(useCase.execute(base)).rejects.toBeInstanceOf(
      OrderCatalogViolationException,
    );
  });

  it('esencial agotada NO incluida no tumba el producto', async () => {
    const extra = option('o-ess', {
      includedByDefault: false,
      isEssential: true,
      isAvailable: false,
    });
    catalog.getOrderableProducts.mockResolvedValue([
      withGroup(product('p1'), [extra]),
    ]);
    const order = await useCase.execute(base);
    expect(order.items).toHaveLength(1);
  });

  it('modifier que no es del producto → 409', async () => {
    const cmd: CreateOrderCommand = {
      ...base,
      items: [
        {
          productId: 'p1',
          quantity: 1,
          modifiers: [{ optionId: 'o-ajena', action: 'added' }],
        },
      ],
    };
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      OrderCatalogViolationException,
    );
  });

  it('removed de opción no removible → 409', async () => {
    const pan = option('o-pan', {
      includedByDefault: true,
      isRemovable: false,
    });
    catalog.getOrderableProducts.mockResolvedValue([
      withGroup(product('p1'), [pan]),
    ]);
    const cmd: CreateOrderCommand = {
      ...base,
      items: [
        {
          productId: 'p1',
          quantity: 1,
          modifiers: [{ optionId: 'o-pan', action: 'removed' }],
        },
      ],
    };
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      OrderCatalogViolationException,
    );
  });

  it('removed de opción no incluida por defecto → 409', async () => {
    const extra = option('o-x', {
      includedByDefault: false,
      isRemovable: true,
    });
    catalog.getOrderableProducts.mockResolvedValue([
      withGroup(product('p1'), [extra]),
    ]);
    const cmd: CreateOrderCommand = {
      ...base,
      items: [
        {
          productId: 'p1',
          quantity: 1,
          modifiers: [{ optionId: 'o-x', action: 'removed' }],
        },
      ],
    };
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      OrderCatalogViolationException,
    );
  });

  it('added de opción agotada → 409', async () => {
    const agotada = option('o-off', { isAvailable: false });
    catalog.getOrderableProducts.mockResolvedValue([
      withGroup(product('p1'), [agotada]),
    ]);
    const cmd: CreateOrderCommand = {
      ...base,
      items: [
        {
          productId: 'p1',
          quantity: 1,
          modifiers: [{ optionId: 'o-off', action: 'added' }],
        },
      ],
    };
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      OrderCatalogViolationException,
    );
  });

  it('reemplazo gratis válido → delta 0 y unit = basePrice', async () => {
    const queso = option('o-queso', {
      includedByDefault: true,
      isReplaceable: true,
      isAvailable: false,
    });
    const topping = option('o-top', {
      includedByDefault: false,
      extraPrice: 2000,
      isReplacementEligible: true,
      isAvailable: true,
    });
    catalog.getOrderableProducts.mockResolvedValue([
      withGroup(product('p1'), [queso, topping]),
    ]);
    const order = await useCase.execute({
      ...base,
      items: [
        {
          productId: 'p1',
          quantity: 1,
          modifiers: [
            { optionId: 'o-queso', action: 'removed' },
            {
              optionId: 'o-top',
              action: 'added',
              replacesOptionId: 'o-queso',
            },
          ],
        },
      ],
    });
    const added = order.items[0].modifiers.find(
      (m) => m.action === ModifierAction.ADDED,
    )!;
    expect(added.priceDelta).toBe(0);
    expect(order.items[0].unitPrice).toBe(14000);
    expect(order.subtotal).toBe(14000);
  });

  it('reemplazo inválido (no elegible) → 409', async () => {
    const queso = option('o-queso', {
      includedByDefault: true,
      isReplaceable: true,
      isAvailable: false,
    });
    const cara = option('o-cara', {
      extraPrice: 5000,
      isReplacementEligible: false,
    });
    catalog.getOrderableProducts.mockResolvedValue([
      withGroup(product('p1'), [queso, cara]),
    ]);
    const cmd: CreateOrderCommand = {
      ...base,
      items: [
        {
          productId: 'p1',
          quantity: 1,
          modifiers: [
            { optionId: 'o-queso', action: 'removed' },
            {
              optionId: 'o-cara',
              action: 'added',
              replacesOptionId: 'o-queso',
            },
          ],
        },
      ],
    };
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      OrderCatalogViolationException,
    );
  });

  it('reemplazo sin fila removed emparejada → 409', async () => {
    const queso = option('o-queso', {
      includedByDefault: true,
      isReplaceable: true,
      isAvailable: false,
    });
    const top = option('o-top', { isReplacementEligible: true });
    catalog.getOrderableProducts.mockResolvedValue([
      withGroup(product('p1'), [queso, top]),
    ]);
    const cmd: CreateOrderCommand = {
      ...base,
      items: [
        {
          productId: 'p1',
          quantity: 1,
          modifiers: [
            {
              optionId: 'o-top',
              action: 'added',
              replacesOptionId: 'o-queso',
            },
          ],
        },
      ],
    };
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      OrderCatalogViolationException,
    );
  });

  it('reemplazo de opción no replaceable → 409', async () => {
    const pan = option('o-pan', {
      includedByDefault: true,
      isReplaceable: false,
      isAvailable: false,
    });
    const top = option('o-top', { isReplacementEligible: true });
    catalog.getOrderableProducts.mockResolvedValue([
      withGroup(product('p1'), [pan, top]),
    ]);
    const cmd: CreateOrderCommand = {
      ...base,
      items: [
        {
          productId: 'p1',
          quantity: 1,
          modifiers: [
            { optionId: 'o-pan', action: 'removed' },
            {
              optionId: 'o-top',
              action: 'added',
              replacesOptionId: 'o-pan',
            },
          ],
        },
      ],
    };
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      OrderCatalogViolationException,
    );
  });

  it('dos added reclamando el mismo removed → 409 (reemplazo de un solo uso)', async () => {
    const queso = option('o-queso', {
      includedByDefault: true,
      isReplaceable: true,
      isAvailable: false,
    });
    const top1 = option('o-top1', {
      extraPrice: 2000,
      isReplacementEligible: true,
    });
    const top2 = option('o-top2', {
      extraPrice: 2000,
      isReplacementEligible: true,
    });
    catalog.getOrderableProducts.mockResolvedValue([
      withGroup(product('p1'), [queso, top1, top2]),
    ]);
    const cmd: CreateOrderCommand = {
      ...base,
      items: [
        {
          productId: 'p1',
          quantity: 1,
          modifiers: [
            { optionId: 'o-queso', action: 'removed' },
            {
              optionId: 'o-top1',
              action: 'added',
              replacesOptionId: 'o-queso',
            },
            {
              optionId: 'o-top2',
              action: 'added',
              replacesOptionId: 'o-queso',
            },
          ],
        },
      ],
    };
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      OrderCatalogViolationException,
    );
  });

  it('optionId duplicado → 409', async () => {
    const opt = option('o1');
    catalog.getOrderableProducts.mockResolvedValue([
      withGroup(product('p1'), [opt]),
    ]);
    const cmd: CreateOrderCommand = {
      ...base,
      items: [
        {
          productId: 'p1',
          quantity: 1,
          modifiers: [
            { optionId: 'o1', action: 'added' },
            { optionId: 'o1', action: 'added' },
          ],
        },
      ],
    };
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      OrderCatalogViolationException,
    );
  });

  it('calcula subtotal + deliveryFee + total y persiste el agregado', async () => {
    const extra = option('o-extra', { extraPrice: 2000 });
    catalog.getOrderableProducts.mockResolvedValue([
      product('p1'),
      withGroup(product('p2', { basePrice: 5000 }), [extra]),
    ]);
    const cmd = {
      ...deliveryCmd,
      paymentMethod: 'cash' as const,
      items: [
        { productId: 'p1', quantity: 2, modifiers: [] },
        {
          productId: 'p2',
          quantity: 1,
          modifiers: [{ optionId: 'o-extra', action: 'added' as const }],
        },
      ],
    };
    delete cmd.payerPhone;
    const order = await useCase.execute(cmd);
    expect(order.channel).toBe(OrderChannel.ONLINE);
    expect(order.serviceType).toBe(OrderServiceType.DELIVERY);
    expect(order.subtotal).toBe(14000 * 2 + (5000 + 2000));
    expect(order.deliveryFee).toBe(2000);
    expect(order.total).toBe(14000 * 2 + 7000 + 2000);
    expect(order.contactPhone).toBe('3009876543');
    expect(order.payment?.status).toBe(PaymentStatus.PENDING);
    expect(order.payment?.method).toBe('cash');
    expect(order.payment?.payerPhone).toBeNull();
    expect(order.payment?.amount).toBe(order.total);
    expect(order.orderDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // §037.A — nacer = entrar al estado: siembra la cola del kanban.
    expect(order.statusChangedAt).toBeInstanceOf(Date);
    expect(orders.createAggregate).toHaveBeenCalledWith(order);
  });

  it('delivery bajo min_delivery_order → MinOrderAmountException (409)', async () => {
    store.getSettings.mockResolvedValue(settings({ minDeliveryOrder: 50000 }));
    await expect(useCase.execute(deliveryCmd)).rejects.toBeInstanceOf(
      MinOrderAmountException,
    );
    expect(orders.createAggregate).not.toHaveBeenCalled();
  });

  it('pickup no cobra deliveryFee ni exige mínimo', async () => {
    store.getSettings.mockResolvedValue(settings({ minDeliveryOrder: 50000 }));
    const order = await useCase.execute(base);
    expect(order.deliveryFee).toBe(0);
    expect(order.subtotal).toBe(14000);
    expect(order.total).toBe(14000);
  });

  it('snapshot de newAddress: "landmark (barrio)" sin address_id', async () => {
    const order = await useCase.execute(deliveryCmd);
    expect(order.addressId).toBeNull();
    expect(order.deliveryAddress).toBe(
      'Casa blanca frente a la cancha (Barrio Centro)',
    );
  });

  it('snapshot de addressId guardada + referencia a la fila', async () => {
    const addr = new Address();
    addr.id = 'a1';
    addr.userId = 'u1';
    addr.landmark = 'Edificio azul';
    addr.neighborhood = null;
    addresses.findByIdForUser.mockResolvedValue(addr);
    const cmd = { ...deliveryCmd, addressId: 'a1' };
    delete cmd.newAddress;
    const order = await useCase.execute(cmd);
    expect(order.addressId).toBe('a1');
    expect(order.deliveryAddress).toBe('Edificio azul');
    expect(addresses.findByIdForUser).toHaveBeenCalledWith('a1', 'u1');
  });

  it('transfer persiste payer_phone; pickup deja contact_phone null', async () => {
    const order = await useCase.execute(base);
    expect(order.payment?.method).toBe('transfer');
    expect(order.payment?.payerPhone).toBe('3001234567');
    expect(order.contactPhone).toBeNull();
    expect(order.deliveryAddress).toBeNull();
    expect(order.clientRequestId).toBeNull();
  });

  it('guarda clientRequestId y deliveryLocationLink cuando vienen', async () => {
    const order = await useCase.execute({
      ...deliveryCmd,
      clientRequestId: 'req-9',
      deliveryLocationLink: 'https://maps.google.com/?q=7.09,-71.72',
      notes: '  Timbre roto  ',
    });
    expect(order.clientRequestId).toBe('req-9');
    expect(order.deliveryLocationLink).toBe(
      'https://maps.google.com/?q=7.09,-71.72',
    );
    expect(order.notes).toBe('Timbre roto');
  });

  it('snapshots §016: productSlug del producto; ítem sin personalizar lleva todos los incluidos', async () => {
    const pan = option('o-pan', {
      name: 'Pan',
      includedByDefault: true,
      isRemovable: false,
    });
    const queso = option('o-queso', {
      name: 'Queso mozzarella',
      includedByDefault: true,
    });
    catalog.getOrderableProducts.mockResolvedValue([
      withGroup(product('p1', { slug: 'el-cachorro' }), [pan, queso]),
    ]);
    const order = await useCase.execute(base);
    expect(order.items[0].productSlug).toBe('el-cachorro');
    expect(order.items[0].includedNames).toEqual(['Pan', 'Queso mozzarella']);
  });

  it('snapshots §016: includedNames = incluidos menos quitados/reemplazados', async () => {
    const pan = option('o-pan', {
      name: 'Pan',
      includedByDefault: true,
      isRemovable: false,
    });
    const queso = option('o-queso', {
      name: 'Queso mozzarella',
      includedByDefault: true,
      isReplaceable: true,
      isAvailable: false,
    });
    const top = option('o-top', {
      name: 'Tocineta',
      extraPrice: 2000,
      isReplacementEligible: true,
    });
    catalog.getOrderableProducts.mockResolvedValue([
      withGroup(product('p1'), [pan, queso, top]),
    ]);
    const order = await useCase.execute({
      ...base,
      items: [
        {
          productId: 'p1',
          quantity: 1,
          modifiers: [
            { optionId: 'o-queso', action: 'removed' },
            {
              optionId: 'o-top',
              action: 'added',
              replacesOptionId: 'o-queso',
            },
          ],
        },
      ],
    });
    expect(order.items[0].includedNames).toEqual(['Pan']);
  });

  it('snapshots §016: modifierGroup por fila; replacesOptionId solo en el added del cambio gratis', async () => {
    const queso = option('o-queso', {
      name: 'Queso mozzarella',
      includedByDefault: true,
      isReplaceable: true,
      isAvailable: false,
    });
    const top = option('o-top', {
      name: 'Tocineta',
      extraPrice: 2000,
      isReplacementEligible: true,
    });
    const extra = option('o-extra', { name: 'Piña', extraPrice: 2500 });
    // Segundo grupo — el slug de la fila sale del grupo, no de la opción.
    const g2 = new ModifierGroup();
    g2.id = 'g2';
    g2.slug = 'toppings';
    g2.name = 'Toppings';
    g2.options = [extra];
    const p = withGroup(product('p1'), [queso, top]);
    p.modifierGroups.push(g2);
    catalog.getOrderableProducts.mockResolvedValue([p]);
    const order = await useCase.execute({
      ...base,
      items: [
        {
          productId: 'p1',
          quantity: 1,
          modifiers: [
            { optionId: 'o-queso', action: 'removed' },
            {
              optionId: 'o-top',
              action: 'added',
              replacesOptionId: 'o-queso',
            },
            { optionId: 'o-extra', action: 'added' },
          ],
        },
      ],
    });
    const [removed, replaced, paid] = order.items[0].modifiers;
    expect(removed.modifierGroup).toBe('ingredients');
    expect(removed.replacesOptionId).toBeNull();
    expect(replaced.modifierGroup).toBe('ingredients');
    expect(replaced.replacesOptionId).toBe('o-queso');
    expect(paid.modifierGroup).toBe('toppings');
    expect(paid.replacesOptionId).toBeNull();
    // El reemplazo salió gratis; el extra pagado sí suma.
    expect(order.items[0].unitPrice).toBe(14000 + 2500);
  });

  it('includedNames suma incluidos de TODOS los grupos, no solo ingredients', async () => {
    const pan = option('o-pan', { name: 'Pan', includedByDefault: true });
    const toppingIncluido = option('o-top-inc', {
      name: 'Tocineta caramelizada',
      includedByDefault: true,
    });
    const g2 = new ModifierGroup();
    g2.id = 'g2';
    g2.slug = 'toppings';
    g2.name = 'Toppings';
    g2.options = [toppingIncluido];
    const p = withGroup(product('p1'), [pan]);
    p.modifierGroups.push(g2);
    catalog.getOrderableProducts.mockResolvedValue([p]);
    const order = await useCase.execute({
      ...base,
      items: [{ productId: 'p1', quantity: 1, modifiers: [] }],
    });
    expect(order.items[0].includedNames).toEqual([
      'Pan',
      'Tocineta caramelizada',
    ]);
  });

  it('transfer despacha el push (amount/payerPhone/referenceHint) y persiste provider+reference', async () => {
    const order = await useCase.execute({ ...base, clientRequestId: 'req-7' });
    expect(gateway.initiatePush).toHaveBeenCalledWith({
      amount: 14000,
      payerPhone: '3001234567',
      referenceHint: 'req-7',
    });
    expect(order.payment?.provider).toBe('sim');
    expect(order.payment?.providerReference).toBe('sim-ref-1');
    expect(order.payment?.status).toBe(PaymentStatus.PENDING);
  });

  it('transfer sin clientRequestId despacha con referenceHint undefined', async () => {
    await useCase.execute(base);
    expect(gateway.initiatePush).toHaveBeenCalledWith({
      amount: 14000,
      payerPhone: '3001234567',
      referenceHint: undefined,
    });
  });

  it('cash NO toca el gateway — provider/providerReference quedan null', async () => {
    const cmd = { ...deliveryCmd, paymentMethod: 'cash' as const };
    delete cmd.payerPhone;
    const order = await useCase.execute(cmd);
    expect(gateway.initiatePush).not.toHaveBeenCalled();
    expect(order.payment?.provider).toBeNull();
    expect(order.payment?.providerReference).toBeNull();
  });

  it('dispatch que lanza PaymentDispatchFailedException → viaja y createAggregate no se llama', async () => {
    gateway.initiatePush.mockRejectedValue(
      new PaymentDispatchFailedException(),
    );
    await expect(useCase.execute(base)).rejects.toBeInstanceOf(
      PaymentDispatchFailedException,
    );
    expect(orders.createAggregate).not.toHaveBeenCalled();
  });
});
