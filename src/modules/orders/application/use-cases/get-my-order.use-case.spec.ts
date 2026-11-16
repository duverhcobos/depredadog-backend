import { Test } from '@nestjs/testing';
import { Order } from '../../domain/entities/order.entity';
import { OrderNotFoundException } from '../../domain/exceptions/order-not-found.exception';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { GetMyOrderUseCase } from './get-my-order.use-case';

describe('GetMyOrderUseCase', () => {
  let useCase: GetMyOrderUseCase;
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
      findUnclosedTerminal: jest.fn(),
      claimUnclosedTerminal: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        GetMyOrderUseCase,
        { provide: ORDER_REPOSITORY, useValue: orders },
      ],
    }).compile();
    useCase = module.get(GetMyOrderUseCase);
  });

  it('devuelve la orden cuando existe y es del cliente', async () => {
    const order = new Order();
    orders.findByIdForCustomer.mockResolvedValue(order);
    const result = await useCase.execute({ orderId: 'o1', customerId: 'u1' });
    expect(result).toBe(order);
    expect(orders.findByIdForCustomer).toHaveBeenCalledWith('o1', 'u1');
  });

  it('orden ajena o inexistente → OrderNotFoundException (404)', async () => {
    orders.findByIdForCustomer.mockResolvedValue(null);
    await expect(
      useCase.execute({ orderId: 'o-ajena', customerId: 'u1' }),
    ).rejects.toBeInstanceOf(OrderNotFoundException);
  });
});
