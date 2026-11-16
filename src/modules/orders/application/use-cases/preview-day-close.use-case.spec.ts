import { Test } from '@nestjs/testing';
import { Payment } from '../../../payments/domain/entities/payment.entity';
import { PaymentMethod } from '../../../payments/domain/enums/payment-method.enum';
import { Order } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import {
  buildDayCloseSummary,
  PreviewDayCloseUseCase,
} from './preview-day-close.use-case';

function order(overrides: Partial<Order> = {}): Order {
  const o = new Order();
  o.id = 'o1';
  o.orderNumber = 1;
  o.status = OrderStatus.DONE;
  o.total = 16000;
  Object.assign(o, overrides);
  return o;
}

function payment(method: PaymentMethod): Payment {
  const p = new Payment();
  p.method = method;
  return p;
}

describe('buildDayCloseSummary', () => {
  it('lista vacía → resumen en ceros (cierre vacío permitido)', () => {
    const s = buildDayCloseSummary([]);
    expect(s.orderCount).toBe(0);
    expect(s.totalAmount).toBe(0);
    expect(s.byMethod).toEqual([]);
    expect(s.cancelledCount).toBe(0);
    expect(s.cancelledAmount).toBe(0);
    expect(s.orders).toEqual([]);
  });

  it('agrupa por método de pago con conteo y monto', () => {
    const s = buildDayCloseSummary([
      order({ id: 'a', total: 10000, payment: payment(PaymentMethod.CASH) }),
      order({ id: 'b', total: 5000, payment: payment(PaymentMethod.CASH) }),
      order({
        id: 'c',
        total: 8000,
        payment: payment(PaymentMethod.TRANSFER),
      }),
    ]);
    expect(s.orderCount).toBe(3);
    expect(s.totalAmount).toBe(23000);
    expect(s.byMethod).toEqual([
      { method: 'cash', count: 2, amount: 15000 },
      { method: 'transfer', count: 1, amount: 8000 },
    ]);
    expect(s.orders.map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('done sin payment → método "unknown"', () => {
    const s = buildDayCloseSummary([order({ payment: null })]);
    expect(s.byMethod).toEqual([
      { method: 'unknown', count: 1, amount: 16000 },
    ]);
    expect(s.orders[0].paymentMethod).toBe('unknown');
  });

  it('cancelados cuentan aparte — no suman al total ni a byMethod', () => {
    const s = buildDayCloseSummary([
      order({ id: 'a', total: 10000, payment: payment(PaymentMethod.CASH) }),
      order({ id: 'x', status: OrderStatus.CANCELLED, total: 4000 }),
      order({ id: 'y', status: OrderStatus.CANCELLED, total: 6000 }),
    ]);
    expect(s.orderCount).toBe(1);
    expect(s.totalAmount).toBe(10000);
    expect(s.cancelledCount).toBe(2);
    expect(s.cancelledAmount).toBe(10000);
    expect(s.byMethod).toHaveLength(1);
    expect(s.orders.map((o) => o.id)).toEqual(['a']);
  });
});

describe('PreviewDayCloseUseCase', () => {
  let useCase: PreviewDayCloseUseCase;
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
        PreviewDayCloseUseCase,
        { provide: ORDER_REPOSITORY, useValue: orders },
      ],
    }).compile();
    useCase = module.get(PreviewDayCloseUseCase);
  });

  it('delega en findUnclosedTerminal y devuelve el summary', async () => {
    orders.findUnclosedTerminal.mockResolvedValue([
      order({ payment: payment(PaymentMethod.CASH) }),
    ]);
    const s = await useCase.execute();
    expect(orders.findUnclosedTerminal).toHaveBeenCalledTimes(1);
    expect(s.orderCount).toBe(1);
    expect(s.totalAmount).toBe(16000);
  });
});
