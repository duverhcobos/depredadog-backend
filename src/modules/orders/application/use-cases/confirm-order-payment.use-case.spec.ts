import { Test } from '@nestjs/testing';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../../auth/domain/repositories/user.repository.interface';
import { Payment } from '../../../payments/domain/entities/payment.entity';
import { PaymentStatus } from '../../../payments/domain/enums/payment-status.enum';
import {
  IStoreRepository,
  STORE_REPOSITORY,
} from '../../../store/domain/repositories/store.repository.interface';
import { Order } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { OrderNotFoundException } from '../../domain/exceptions/order-not-found.exception';
import { PaymentNotConfirmableException } from '../../domain/exceptions/payment-not-confirmable.exception';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { ConfirmOrderPaymentUseCase } from './confirm-order-payment.use-case';

function order(payment?: Payment | null): Order {
  const o = new Order();
  o.id = 'o1';
  o.customerId = 'u1';
  o.status = OrderStatus.CONFIRMED;
  o.items = [];
  o.payment = payment ?? null;
  return o;
}

function payment(status: PaymentStatus): Payment {
  const p = new Payment();
  p.id = 'pay1';
  p.status = status;
  return p;
}

describe('ConfirmOrderPaymentUseCase', () => {
  let useCase: ConfirmOrderPaymentUseCase;
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
      confirmPayment: jest.fn(() => Promise.resolve(true)),
      findActiveTableIds: jest.fn(),
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
        ConfirmOrderPaymentUseCase,
        { provide: ORDER_REPOSITORY, useValue: orders },
        { provide: STORE_REPOSITORY, useValue: store },
        { provide: USER_REPOSITORY, useValue: users },
      ],
    }).compile();
    useCase = module.get(ConfirmOrderPaymentUseCase);
  });

  it('pending → paid: claim con adminId, responde el pago resuelto', async () => {
    const p = payment(PaymentStatus.PENDING);
    orders.findById.mockResolvedValue(order(p));

    const res = await useCase.execute({ orderId: 'o1', adminId: 'admin1' });

    expect(orders.confirmPayment).toHaveBeenCalledWith('o1', 'admin1');
    expect(p.status).toBe(PaymentStatus.PAID);
    expect(p.confirmedBy).toBe('admin1');
    expect(p.confirmedAt).toBeInstanceOf(Date);
    expect(res.order.payment?.status).toBe('paid');
  });

  it('paid → idempotente: responde la orden sin claim', async () => {
    orders.findById.mockResolvedValue(order(payment(PaymentStatus.PAID)));

    const res = await useCase.execute({ orderId: 'o1', adminId: 'admin1' });

    expect(orders.confirmPayment).not.toHaveBeenCalled();
    expect(res.order.payment?.status).toBe('paid');
  });

  it.each([PaymentStatus.FAILED, PaymentStatus.REFUNDED])(
    '%s → PaymentNotConfirmableException (409)',
    async (status) => {
      orders.findById.mockResolvedValue(order(payment(status)));
      await expect(
        useCase.execute({ orderId: 'o1', adminId: 'admin1' }),
      ).rejects.toBeInstanceOf(PaymentNotConfirmableException);
      expect(orders.confirmPayment).not.toHaveBeenCalled();
    },
  );

  it('sin payment → PaymentNotConfirmableException', async () => {
    orders.findById.mockResolvedValue(order(null));
    await expect(
      useCase.execute({ orderId: 'o1', adminId: 'admin1' }),
    ).rejects.toBeInstanceOf(PaymentNotConfirmableException);
  });

  it('claim perdido (false) → PaymentNotConfirmableException', async () => {
    orders.findById.mockResolvedValue(order(payment(PaymentStatus.PENDING)));
    orders.confirmPayment.mockResolvedValue(false);
    await expect(
      useCase.execute({ orderId: 'o1', adminId: 'admin1' }),
    ).rejects.toBeInstanceOf(PaymentNotConfirmableException);
  });

  it('inexistente → OrderNotFoundException (404)', async () => {
    orders.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ orderId: 'o-x', adminId: 'admin1' }),
    ).rejects.toBeInstanceOf(OrderNotFoundException);
  });
});
