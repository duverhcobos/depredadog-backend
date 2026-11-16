import { Test } from '@nestjs/testing';
import { Payment } from '../../../payments/domain/entities/payment.entity';
import { PaymentStatus } from '../../../payments/domain/enums/payment-status.enum';
import { Order } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { OrderNotCancellableException } from '../../domain/exceptions/order-not-cancellable.exception';
import { OrderNotFoundException } from '../../domain/exceptions/order-not-found.exception';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { CancelMyOrderUseCase } from './cancel-my-order.use-case';

function pendingOrder(): Order {
  const o = new Order();
  o.id = 'o1';
  o.customerId = 'u1';
  o.status = OrderStatus.PENDING;
  const p = new Payment();
  p.status = PaymentStatus.PENDING;
  o.payment = p;
  return o;
}

describe('CancelMyOrderUseCase', () => {
  let useCase: CancelMyOrderUseCase;
  let orders: jest.Mocked<IOrderRepository>;

  beforeEach(async () => {
    orders = {
      findByClientRequest: jest.fn(),
      createAggregate: jest.fn(),
      findByCustomer: jest.fn(),
      findByIdForCustomer: jest.fn(),
      findByProviderReference: jest.fn(),
      cancelPendingAggregate: jest.fn(() => Promise.resolve(true)),
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
        CancelMyOrderUseCase,
        { provide: ORDER_REPOSITORY, useValue: orders },
      ],
    }).compile();
    useCase = module.get(CancelMyOrderUseCase);
  });

  it('pending → cancelled + payment failed en la misma tx', async () => {
    const order = pendingOrder();
    orders.findByIdForCustomer.mockResolvedValue(order);
    const saved = await useCase.execute({
      orderId: 'o1',
      customerId: 'u1',
      reason: '  Me equivoqué  ',
    });
    expect(saved.status).toBe(OrderStatus.CANCELLED);
    expect(saved.cancelReason).toBe('Me equivoqué');
    expect(saved.payment?.status).toBe(PaymentStatus.FAILED);
    expect(orders.cancelPendingAggregate).toHaveBeenCalledWith(order);
  });

  it('confirmed → OrderNotCancellableException (409)', async () => {
    const order = pendingOrder();
    order.status = OrderStatus.CONFIRMED;
    orders.findByIdForCustomer.mockResolvedValue(order);
    await expect(
      useCase.execute({ orderId: 'o1', customerId: 'u1' }),
    ).rejects.toBeInstanceOf(OrderNotCancellableException);
    expect(orders.cancelPendingAggregate).not.toHaveBeenCalled();
  });

  it('ajena/inexistente → OrderNotFoundException (404)', async () => {
    orders.findByIdForCustomer.mockResolvedValue(null);
    await expect(
      useCase.execute({ orderId: 'o-x', customerId: 'u1' }),
    ).rejects.toBeInstanceOf(OrderNotFoundException);
    expect(orders.cancelPendingAggregate).not.toHaveBeenCalled();
  });

  it('sin reason → cancelReason null; pago ya pago no se toca', async () => {
    const order = pendingOrder();
    order.payment!.status = PaymentStatus.PAID;
    orders.findByIdForCustomer.mockResolvedValue(order);
    const saved = await useCase.execute({ orderId: 'o1', customerId: 'u1' });
    expect(saved.cancelReason).toBeNull();
    expect(saved.payment?.status).toBe(PaymentStatus.PAID);
  });

  it('cancelPendingAggregate → false (webhook ganó la carrera) → OrderNotCancellableException', async () => {
    const order = pendingOrder();
    orders.findByIdForCustomer.mockResolvedValue(order);
    orders.cancelPendingAggregate.mockResolvedValue(false);
    await expect(
      useCase.execute({ orderId: 'o1', customerId: 'u1' }),
    ).rejects.toBeInstanceOf(OrderNotCancellableException);
  });
});
