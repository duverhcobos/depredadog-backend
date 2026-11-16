import { Test } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { Payment } from '../../../payments/domain/entities/payment.entity';
import { PaymentMethod } from '../../../payments/domain/enums/payment-method.enum';
import { DayClose } from '../../domain/entities/day-close.entity';
import { Order } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import {
  IDayCloseRepository,
  DAY_CLOSE_REPOSITORY,
} from '../../domain/repositories/day-close.repository.interface';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { CloseDayUseCase } from './close-day.use-case';

function order(overrides: Partial<Order> = {}): Order {
  const o = new Order();
  o.id = 'o1';
  o.orderNumber = 1;
  o.status = OrderStatus.DONE;
  o.total = 16000;
  const p = new Payment();
  p.method = PaymentMethod.CASH;
  o.payment = p;
  Object.assign(o, overrides);
  return o;
}

describe('CloseDayUseCase', () => {
  let useCase: CloseDayUseCase;
  let orders: jest.Mocked<IOrderRepository>;
  let dayCloses: jest.Mocked<IDayCloseRepository>;
  let em: EntityManager;

  beforeEach(async () => {
    em = {} as EntityManager;
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
    dayCloses = {
      // El primer save genera el id del cierre; el segundo devuelve
      // el registro ya con el snapshot — responde la misma entidad.
      save: jest.fn((c: DayClose) => {
        if (!c.id) c.id = 'dc-1';
        return Promise.resolve(c);
      }),
    };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
        Promise.resolve(cb(em)),
      ),
    };
    const module = await Test.createTestingModule({
      providers: [
        CloseDayUseCase,
        { provide: ORDER_REPOSITORY, useValue: orders },
        { provide: DAY_CLOSE_REPOSITORY, useValue: dayCloses },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    useCase = module.get(CloseDayUseCase);
  });

  it('happy path: claim con el id del cierre + snapshot por método + cancelados', async () => {
    orders.claimUnclosedTerminal.mockResolvedValue([
      order({ id: 'a', total: 10000 }),
      order({
        id: 'b',
        total: 8000,
        payment: Object.assign(new Payment(), {
          method: PaymentMethod.TRANSFER,
        }),
      }),
      order({ id: 'x', status: OrderStatus.CANCELLED, total: 4000 }),
    ]);

    const res = await useCase.execute({ adminId: 'admin1' });

    expect(orders.claimUnclosedTerminal).toHaveBeenCalledWith('dc-1', em);
    // Dos saves: registro inicial y con el snapshot — todo en la tx.
    expect(dayCloses.save).toHaveBeenCalledTimes(2);
    const persisted = dayCloses.save.mock.calls[1][0];
    expect(persisted.orderCount).toBe(2);
    expect(persisted.totalAmount).toBe(18000);
    expect(persisted.cancelledCount).toBe(1);
    expect(persisted.cancelledAmount).toBe(4000);
    expect(persisted.methodBreakdown).toEqual([
      { method: 'cash', count: 1, amount: 10000 },
      { method: 'transfer', count: 1, amount: 8000 },
    ]);
    expect(res.id).toBe('dc-1');
    expect(res.closedAt).toBeInstanceOf(Date);
    expect(res.orderCount).toBe(2);
    expect(res.byMethod).toHaveLength(2);
  });

  it('cierre vacío → registro con ceros (no hay 409 — bitácora)', async () => {
    orders.claimUnclosedTerminal.mockResolvedValue([]);

    const res = await useCase.execute({ adminId: 'admin1' });

    const persisted = dayCloses.save.mock.calls[1][0];
    expect(persisted.orderCount).toBe(0);
    expect(persisted.totalAmount).toBe(0);
    expect(persisted.methodBreakdown).toEqual([]);
    expect(res.orderCount).toBe(0);
    expect(res.orders).toEqual([]);
  });

  it('note viaja trimmeada; vacía/espacios → null', async () => {
    orders.claimUnclosedTerminal.mockResolvedValue([]);

    const res = await useCase.execute({
      adminId: 'admin1',
      note: '  Cierre de prueba  ',
    });
    expect(res.note).toBe('Cierre de prueba');
    const saved = dayCloses.save.mock.calls[0][0];
    expect(saved.closedBy).toBe('admin1');
    expect(saved.note).toBe('Cierre de prueba');

    const res2 = await useCase.execute({ adminId: 'admin1', note: '   ' });
    expect(res2.note).toBeNull();
  });

  it('un done ya cerrado no entra dos veces — solo cuenta lo reclamado', async () => {
    // El claim SQL reclama solo day_close_id IS NULL; acá devuelve 1
    // de los 2 done del local — el otro ya estaba cerrado.
    orders.claimUnclosedTerminal.mockResolvedValue([order({ id: 'a' })]);

    const res = await useCase.execute({ adminId: 'admin1' });

    expect(res.orderCount).toBe(1);
    expect(res.totalAmount).toBe(16000);
  });
});
