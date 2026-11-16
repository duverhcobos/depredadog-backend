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
import { OrderChannel } from '../../domain/enums/order-channel.enum';
import { OrderServiceType } from '../../domain/enums/order-service-type.enum';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { InvalidStatusTransitionException } from '../../domain/exceptions/invalid-status-transition.exception';
import { OrderNotFoundException } from '../../domain/exceptions/order-not-found.exception';
import { PaymentNotSettledException } from '../../domain/exceptions/payment-not-settled.exception';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { UpdateOrderStatusUseCase } from './update-order-status.use-case';

function order(
  status: OrderStatus,
  payment?: PaymentStatus,
  overrides: Partial<Order> = {},
): Order {
  const o = new Order();
  o.id = 'o1';
  o.customerId = 'u1';
  o.status = status;
  o.channel = OrderChannel.ONLINE;
  o.serviceType = OrderServiceType.DELIVERY;
  o.items = [];
  if (payment) {
    const p = new Payment();
    p.id = 'pay1';
    p.status = payment;
    o.payment = p;
  }
  Object.assign(o, overrides);
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

  it('la cadena del kanban: confirmed→preparing→ready→done (paid)', async () => {
    const steps: [OrderStatus, OrderStatus][] = [
      [OrderStatus.CONFIRMED, OrderStatus.PREPARING],
      [OrderStatus.PREPARING, OrderStatus.READY],
      [OrderStatus.READY, OrderStatus.DONE],
    ];
    for (const [from, to] of steps) {
      orders.findById.mockResolvedValue(order(from, PaymentStatus.PAID));
      const res = await useCase.execute({ orderId: 'o1', to });
      expect(res.order.status).toBe(to);
    }
  });

  it('ready → done con payment paid', async () => {
    orders.findById.mockResolvedValue(
      order(OrderStatus.READY, PaymentStatus.PAID),
    );
    const res = await useCase.execute({
      orderId: 'o1',
      to: OrderStatus.DONE,
    });
    expect(res.order.status).toBe('done');
  });

  it('cada transición estampa statusChangedAt antes del claim (§037.A)', async () => {
    const before = Date.now();
    orders.findById.mockResolvedValue(order(OrderStatus.PENDING));
    let stampAlClaim: Date | undefined;
    orders.transitionStatus.mockImplementation((o) => {
      stampAlClaim = o.statusChangedAt;
      return Promise.resolve(true);
    });
    const res = await useCase.execute({
      orderId: 'o1',
      to: OrderStatus.CONFIRMED,
    });
    expect(stampAlClaim).toBeInstanceOf(Date);
    expect(stampAlClaim!.getTime()).toBeGreaterThanOrEqual(before);
    expect(res.order.statusChangedAt).toBe(stampAlClaim);
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
    [OrderStatus.PENDING, OrderStatus.PREPARING], // salto prohibido
    [OrderStatus.PENDING, OrderStatus.READY], // salto prohibido
    [OrderStatus.CONFIRMED, OrderStatus.CONFIRMED],
    [OrderStatus.CONFIRMED, OrderStatus.PENDING], // no retrocede
    [OrderStatus.CONFIRMED, OrderStatus.READY], // salto prohibido
    [OrderStatus.CONFIRMED, OrderStatus.DONE], // §022 — era válido, ahora salta
    [OrderStatus.PREPARING, OrderStatus.DONE], // §022 — salta ready
    [OrderStatus.PREPARING, OrderStatus.CONFIRMED], // no retrocede
    [OrderStatus.READY, OrderStatus.PREPARING], // no retrocede
    [OrderStatus.READY, OrderStatus.CONFIRMED], // no retrocede
    [OrderStatus.DONE, OrderStatus.CANCELLED], // terminal
    [OrderStatus.CANCELLED, OrderStatus.CONFIRMED], // terminal
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

  it('ready → done con payment pending → PaymentNotSettledException (409)', async () => {
    orders.findById.mockResolvedValue(
      order(OrderStatus.READY, PaymentStatus.PENDING),
    );
    await expect(
      useCase.execute({ orderId: 'o1', to: OrderStatus.DONE }),
    ).rejects.toBeInstanceOf(PaymentNotSettledException);
    expect(orders.transitionStatus).not.toHaveBeenCalled();
  });

  it('ready → done sin payment (agregado raro) → PaymentNotSettledException', async () => {
    orders.findById.mockResolvedValue(order(OrderStatus.READY));
    await expect(
      useCase.execute({ orderId: 'o1', to: OrderStatus.DONE }),
    ).rejects.toBeInstanceOf(PaymentNotSettledException);
  });

  it('presencial pickup sin cobrar no confirma → PaymentNotSettledException (§037.D)', async () => {
    orders.findById.mockResolvedValue(
      order(OrderStatus.PENDING, PaymentStatus.PENDING, {
        channel: OrderChannel.PRESENCIAL,
        serviceType: OrderServiceType.PICKUP,
      }),
    );
    await expect(
      useCase.execute({ orderId: 'o1', to: OrderStatus.CONFIRMED }),
    ).rejects.toBeInstanceOf(PaymentNotSettledException);
    expect(orders.transitionStatus).not.toHaveBeenCalled();
  });

  it('presencial pickup ya pago → confirmed libre (la puerta solo exige el cobro)', async () => {
    orders.findById.mockResolvedValue(
      order(OrderStatus.PENDING, PaymentStatus.PAID, {
        channel: OrderChannel.PRESENCIAL,
        serviceType: OrderServiceType.PICKUP,
      }),
    );
    const res = await useCase.execute({
      orderId: 'o1',
      to: OrderStatus.CONFIRMED,
    });
    expect(res.order.status).toBe('confirmed');
  });

  it('online pickup sin cobrar sí confirma — la puerta es solo presencial', async () => {
    orders.findById.mockResolvedValue(
      order(OrderStatus.PENDING, PaymentStatus.PENDING, {
        serviceType: OrderServiceType.PICKUP,
      }),
    );
    const res = await useCase.execute({
      orderId: 'o1',
      to: OrderStatus.CONFIRMED,
    });
    expect(res.order.status).toBe('confirmed');
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
