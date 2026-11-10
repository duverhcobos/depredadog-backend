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
import { InvalidStatusTransitionException } from '../../domain/exceptions/invalid-status-transition.exception';
import { OrderNotFoundException } from '../../domain/exceptions/order-not-found.exception';
import { PaymentNotSettledException } from '../../domain/exceptions/payment-not-settled.exception';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { UpdateOrderStatusUseCase } from './update-order-status.use-case';

function order(status: OrderStatus, payment?: PaymentStatus): Order {
  const o = new Order();
  o.id = 'o1';
  o.customerId = 'u1';
  o.status = status;
  o.items = [];
  if (payment) {
    const p = new Payment();
    p.id = 'pay1';
    p.status = payment;
    o.payment = p;
  }
  return o;
}

describe('UpdateOrderStatusUseCase', () => {
  let useCase: UpdateOrderStatusUseCase;
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
      transitionStatus: jest.fn(() => Promise.resolve(true)),
      confirmPayment: jest.fn(),
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
        UpdateOrderStatusUseCase,
        { provide: ORDER_REPOSITORY, useValue: orders },
        { provide: STORE_REPOSITORY, useValue: store },
        { provide: USER_REPOSITORY, useValue: users },
      ],
    }).compile();
    useCase = module.get(UpdateOrderStatusUseCase);
  });

  it('pending → confirmed mueve la orden y responde hidratada', async () => {
    orders.findById.mockResolvedValue(order(OrderStatus.PENDING));
    users.findNamesByIds.mockResolvedValue(new Map([['u1', 'Test User']]));
    // El use-case muta order.status DESPUÉS del claim — capturar el
    // from al momento de la llamada (la referencia queda mutada).
    let statusAlClaim: OrderStatus | undefined;
    orders.transitionStatus.mockImplementation((o) => {
      statusAlClaim = o.status;
      return Promise.resolve(true);
    });

    const res = await useCase.execute({
      orderId: 'o1',
      to: OrderStatus.CONFIRMED,
    });

    expect(statusAlClaim).toBe(OrderStatus.PENDING);
    expect(orders.transitionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'o1' }),
      OrderStatus.CONFIRMED,
    );
    expect(res.order.status).toBe('confirmed');
    expect(res.customerName).toBe('Test User');
  });

  it('confirmed → done con payment paid', async () => {
    orders.findById.mockResolvedValue(
      order(OrderStatus.CONFIRMED, PaymentStatus.PAID),
    );
    const res = await useCase.execute({
      orderId: 'o1',
      to: OrderStatus.DONE,
    });
    expect(res.order.status).toBe('done');
  });

  it('pending → cancelled con reason y payment pendiente → failed', async () => {
    const o = order(OrderStatus.PENDING, PaymentStatus.PENDING);
    orders.findById.mockResolvedValue(o);

    const res = await useCase.execute({
      orderId: 'o1',
      to: OrderStatus.CANCELLED,
      cancelReason: '  Se demoró mucho  ',
    });

    expect(o.payment?.status).toBe(PaymentStatus.FAILED);
    expect(res.order.status).toBe('cancelled');
    expect(res.order.cancelReason).toBe('Se demoró mucho');
  });

  it('confirmed → cancelled también vale (matriz)', async () => {
    orders.findById.mockResolvedValue(
      order(OrderStatus.CONFIRMED, PaymentStatus.PAID),
    );
    const res = await useCase.execute({
      orderId: 'o1',
      to: OrderStatus.CANCELLED,
    });
    expect(res.order.status).toBe('cancelled');
    // El pago 'paid' NO se toca — reembolso manual (pendiente).
    expect(res.order.payment?.status).toBe('paid');
  });

  it.each<[OrderStatus, OrderStatus]>([
    [OrderStatus.PENDING, OrderStatus.DONE], // salto prohibido
    [OrderStatus.PENDING, OrderStatus.PREPARING], // fuera de contrato
    [OrderStatus.CONFIRMED, OrderStatus.CONFIRMED],
    [OrderStatus.CONFIRMED, OrderStatus.PENDING], // no retrocede
    [OrderStatus.CONFIRMED, OrderStatus.PREPARING],
    [OrderStatus.DONE, OrderStatus.CANCELLED], // terminal
    [OrderStatus.CANCELLED, OrderStatus.CONFIRMED], // terminal
    [OrderStatus.PREPARING, OrderStatus.CONFIRMED], // enum reservado
  ])(
    '%s → %s → InvalidStatusTransitionException sin write',
    async (from, to) => {
      orders.findById.mockResolvedValue(order(from, PaymentStatus.PAID));
      await expect(
        useCase.execute({ orderId: 'o1', to }),
      ).rejects.toBeInstanceOf(InvalidStatusTransitionException);
      expect(orders.transitionStatus).not.toHaveBeenCalled();
    },
  );

  it('done con payment pending → PaymentNotSettledException (409)', async () => {
    orders.findById.mockResolvedValue(
      order(OrderStatus.CONFIRMED, PaymentStatus.PENDING),
    );
    await expect(
      useCase.execute({ orderId: 'o1', to: OrderStatus.DONE }),
    ).rejects.toBeInstanceOf(PaymentNotSettledException);
    expect(orders.transitionStatus).not.toHaveBeenCalled();
  });

  it('done sin payment (agregado raro) → PaymentNotSettledException', async () => {
    orders.findById.mockResolvedValue(order(OrderStatus.CONFIRMED));
    await expect(
      useCase.execute({ orderId: 'o1', to: OrderStatus.DONE }),
    ).rejects.toBeInstanceOf(PaymentNotSettledException);
  });

  it('inexistente → OrderNotFoundException (404)', async () => {
    orders.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ orderId: 'o-x', to: OrderStatus.CONFIRMED }),
    ).rejects.toBeInstanceOf(OrderNotFoundException);
    expect(orders.transitionStatus).not.toHaveBeenCalled();
  });

  it('transitionStatus → false (carrera perdida) → 409', async () => {
    orders.findById.mockResolvedValue(order(OrderStatus.PENDING));
    orders.transitionStatus.mockResolvedValue(false);
    await expect(
      useCase.execute({ orderId: 'o1', to: OrderStatus.CONFIRMED }),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionException);
  });
});
