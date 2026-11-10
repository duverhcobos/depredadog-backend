import { Test } from '@nestjs/testing';
import { StoreTable } from '../../../store/domain/entities/store-table.entity';
import {
  IStoreRepository,
  STORE_REPOSITORY,
} from '../../../store/domain/repositories/store.repository.interface';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { ListAdminTablesUseCase } from './list-admin-tables.use-case';

function table(id: string, label: string, isActive = true): StoreTable {
  const t = new StoreTable();
  t.id = id;
  t.label = label;
  t.isActive = isActive;
  return t;
}

describe('ListAdminTablesUseCase', () => {
  let useCase: ListAdminTablesUseCase;
  let store: jest.Mocked<IStoreRepository>;
  let orders: jest.Mocked<IOrderRepository>;

  beforeEach(async () => {
    store = {
      getSettings: jest.fn(),
      getBusinessHours: jest.fn(),
      getTables: jest.fn(),
      getTablesByIds: jest.fn(),
    };
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
    const module = await Test.createTestingModule({
      providers: [
        ListAdminTablesUseCase,
        { provide: STORE_REPOSITORY, useValue: store },
        { provide: ORDER_REPOSITORY, useValue: orders },
      ],
    }).compile();
    useCase = module.get(ListAdminTablesUseCase);
  });

  it('devuelve mesas + mapa de ocupación (el mapper arma el DTO)', async () => {
    store.getTables.mockResolvedValue([
      table('t1', 'Mesa 1'),
      table('t2', 'Mesa 2'),
      table('t3', 'Mesa 3', false),
    ]);
    orders.findActiveTableIds.mockResolvedValue(new Map([['t2', 7]]));

    const res = await useCase.execute();

    expect(res.tables).toHaveLength(3);
    expect(res.activeByTable.get('t2')).toBe(7);
    expect(res.activeByTable.has('t1')).toBe(false);
  });

  it('sin mesas → tables [] y mapa vacío', async () => {
    store.getTables.mockResolvedValue([]);
    orders.findActiveTableIds.mockResolvedValue(new Map());
    const res = await useCase.execute();
    expect(res).toEqual({ tables: [], activeByTable: new Map() });
  });
});
