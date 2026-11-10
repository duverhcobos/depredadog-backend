import { Test } from '@nestjs/testing';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { ListMyOrdersUseCase } from './list-my-orders.use-case';

describe('ListMyOrdersUseCase', () => {
  let useCase: ListMyOrdersUseCase;
  let orders: jest.Mocked<IOrderRepository>;

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
    const module = await Test.createTestingModule({
      providers: [
        ListMyOrdersUseCase,
        { provide: ORDER_REPOSITORY, useValue: orders },
      ],
    }).compile();
    useCase = module.get(ListMyOrdersUseCase);
  });

  it('delega bucket/page/limit al repositorio', async () => {
    orders.findByCustomer.mockResolvedValue({ items: [], total: 0 });
    const result = await useCase.execute({
      customerId: 'u1',
      bucket: 'history',
      page: 2,
      limit: 10,
    });
    expect(orders.findByCustomer).toHaveBeenCalledWith('u1', 'history', 2, 10);
    expect(result).toEqual({ items: [], total: 0 });
  });
});
