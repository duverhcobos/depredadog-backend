import { Test } from '@nestjs/testing';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../../auth/domain/repositories/user.repository.interface';
import { StoreTable } from '../../../store/domain/entities/store-table.entity';
import {
  IStoreRepository,
  STORE_REPOSITORY,
} from '../../../store/domain/repositories/store.repository.interface';
import { Order } from '../../domain/entities/order.entity';
import { OrderChannel } from '../../domain/enums/order-channel.enum';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { ListAdminOrdersUseCase } from './list-admin-orders.use-case';

function order(overrides: Partial<Order> = {}): Order {
  const o = new Order();
  o.id = 'o1';
  o.customerId = 'u1';
  o.channel = OrderChannel.ONLINE;
  o.items = [];
  Object.assign(o, overrides);
  return o;
}

function table(id: string, label: string): StoreTable {
  const t = new StoreTable();
  t.id = id;
  t.label = label;
  return t;
}

describe('ListAdminOrdersUseCase', () => {
  let useCase: ListAdminOrdersUseCase;
  let orders: jest.Mocked<IOrderRepository>;
  let store: jest.Mocked<IStoreRepository>;
  let users: jest.Mocked<IUserRepository>;

  beforeEach(async () => {
    orders = {
      findByClientRequest: jest.fn(),
      createAggregate: jest.fn(),
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
    };
    store = {
      getSettings: jest.fn(),
      getBusinessHours: jest.fn(),
      getTables: jest.fn(),
      getTablesByIds: jest.fn(),
    };
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      findNamesByIds: jest.fn(),
      save: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        ListAdminOrdersUseCase,
        { provide: ORDER_REPOSITORY, useValue: orders },
        { provide: STORE_REPOSITORY, useValue: store },
        { provide: USER_REPOSITORY, useValue: users },
      ],
    }).compile();
    useCase = module.get(ListAdminOrdersUseCase);
  });

  it('delega bucket/page/limit y devuelve el resultado interno', async () => {
    orders.findForAdmin.mockResolvedValue({ items: [order()], total: 1 });
    store.getTablesByIds.mockResolvedValue([]);
    users.findNamesByIds.mockResolvedValue(new Map([['u1', 'Test User']]));

    const res = await useCase.execute({
      bucket: 'history',
      page: 2,
      limit: 10,
    });

    expect(orders.findForAdmin).toHaveBeenCalledWith('history', 2, 10);
    expect(res.total).toBe(1);
    expect(res.items[0].customerName).toBe('Test User');
    expect(res.items[0].order.channel).toBe('online');
    expect(res.items[0].tableLabel).toBeNull();
  });

  it('enriquece mesa y cliente batcheado (anti N+1)', async () => {
    orders.findForAdmin.mockResolvedValue({
      items: [
        order({ id: 'o1', tableId: 't1', customerId: 'u1' }),
        order({ id: 'o2', tableId: 't1', customerId: 'u2' }),
      ],
      total: 2,
    });
    store.getTablesByIds.mockResolvedValue([table('t1', 'Mesa 3')]);
    users.findNamesByIds.mockResolvedValue(
      new Map([
        ['u1', 'Ana Uno'],
        ['u2', 'Beto Dos'],
      ]),
    );

    const res = await useCase.execute({ bucket: 'active', page: 1, limit: 20 });

    // Dedup: una sola mesa y dos clientes en los lookups.
    expect(store.getTablesByIds).toHaveBeenCalledWith(['t1']);
    expect(users.findNamesByIds).toHaveBeenCalledWith(['u1', 'u2']);
    expect(res.items[0].tableLabel).toBe('Mesa 3');
    expect(res.items[0].customerName).toBe('Ana Uno');
    expect(res.items[1].customerName).toBe('Beto Dos');
  });

  it('presencial sin customer ni mesa → nulls, no revienta', async () => {
    orders.findForAdmin.mockResolvedValue({
      items: [
        order({
          id: 'o1',
          customerId: null,
          tableId: null,
          channel: OrderChannel.PRESENCIAL,
        }),
      ],
      total: 1,
    });
    store.getTablesByIds.mockResolvedValue([]);
    users.findNamesByIds.mockResolvedValue(new Map());

    const res = await useCase.execute({ bucket: 'active', page: 1, limit: 20 });

    expect(res.items[0].customerName).toBeNull();
    expect(res.items[0].tableLabel).toBeNull();
    expect(res.items[0].order.channel).toBe('presencial');
  });

  it('página vacía → items [] con total consistente', async () => {
    orders.findForAdmin.mockResolvedValue({ items: [], total: 0 });
    store.getTablesByIds.mockResolvedValue([]);
    users.findNamesByIds.mockResolvedValue(new Map());

    const res = await useCase.execute({ bucket: 'active', page: 1, limit: 20 });

    expect(res).toEqual({ items: [], total: 0 });
  });
});
