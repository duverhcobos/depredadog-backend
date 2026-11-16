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
import { OrderNotFoundException } from '../../domain/exceptions/order-not-found.exception';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { GetAdminOrderUseCase } from './get-admin-order.use-case';

describe('GetAdminOrderUseCase', () => {
  let useCase: GetAdminOrderUseCase;
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
      findUnclosedTerminal: jest.fn(),
      claimUnclosedTerminal: jest.fn(),
    };
    store = {
      getSettings: jest.fn(),
      getBusinessHours: jest.fn(),
      getTables: jest.fn(),
      getTablesByIds: jest.fn(() => Promise.resolve([])),
    };
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      findNamesByIds: jest.fn(() => Promise.resolve(new Map())),
      save: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        GetAdminOrderUseCase,
        { provide: ORDER_REPOSITORY, useValue: orders },
        { provide: STORE_REPOSITORY, useValue: store },
        { provide: USER_REPOSITORY, useValue: users },
      ],
    }).compile();
    useCase = module.get(GetAdminOrderUseCase);
  });

  it('devuelve la orden hidratada cuando existe — sin filtro de cliente', async () => {
    const order = new Order();
    order.id = 'o1';
    order.customerId = 'u1';
    order.tableId = 't1';
    orders.findById.mockResolvedValue(order);
    const mesa = new StoreTable();
    mesa.id = 't1';
    mesa.label = 'Mesa 1';
    store.getTablesByIds.mockResolvedValue([mesa]);
    users.findNamesByIds.mockResolvedValue(new Map([['u1', 'Test User']]));

    const result = await useCase.execute({ orderId: 'o1' });

    expect(result.order).toBe(order);
    expect(result.tableLabel).toBe('Mesa 1');
    expect(result.customerName).toBe('Test User');
    expect(orders.findById).toHaveBeenCalledWith('o1');
  });

  it('inexistente → OrderNotFoundException (404)', async () => {
    orders.findById.mockResolvedValue(null);
    await expect(useCase.execute({ orderId: 'o-x' })).rejects.toBeInstanceOf(
      OrderNotFoundException,
    );
  });
});
