import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '../../../payments/domain/enums/payment-status.enum';
import {
  IPaymentGateway,
  PAYMENT_GATEWAY,
} from '../../../payments/domain/services/payment-gateway.interface';
import { StoreTable } from '../../../store/domain/entities/store-table.entity';
import {
  IStoreRepository,
  STORE_REPOSITORY,
} from '../../../store/domain/repositories/store.repository.interface';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { OrderChannel } from '../../domain/enums/order-channel.enum';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { InvalidOrderDataException } from '../../domain/exceptions/invalid-order-data.exception';
import { TableNotFoundException } from '../../domain/exceptions/table-not-found.exception';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { OrderItemsBuilder } from '../../domain/services/order-items-builder.service';
import {
  CreateInPersonOrderCommand,
  CreateInPersonOrderUseCase,
} from './create-in-person-order.use-case';

function table(overrides: Partial<StoreTable> = {}): StoreTable {
  const t = new StoreTable();
  t.id = 't1';
  t.label = 'Mesa 1';
  t.isActive = true;
  Object.assign(t, overrides);
  return t;
}

function builtItem(): OrderItem {
  const i = new OrderItem();
  i.productId = 'p1';
  i.productName = 'El Cachorro';
  i.unitPrice = 14000;
  i.quantity = 1;
  i.lineTotal = 14000;
  return i;
}

describe('CreateInPersonOrderUseCase', () => {
  let useCase: CreateInPersonOrderUseCase;
  let orders: jest.Mocked<IOrderRepository>;
  let gateway: jest.Mocked<IPaymentGateway>;
  let store: jest.Mocked<IStoreRepository>;
  let itemsBuilder: { build: jest.Mock };

  const base: CreateInPersonOrderCommand = {
    adminId: 'admin1',
    serviceType: 'dine_in',
    tableId: 't1',
    items: [{ productId: 'p1', quantity: 1, modifiers: [] }],
    paymentMethod: 'cash',
  };

  beforeEach(async () => {
    orders = {
      findByClientRequest: jest.fn(),
      createAggregate: jest.fn((o) => Promise.resolve(o)),
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
    gateway = {
      initiatePush: jest.fn(() =>
        Promise.resolve({ provider: 'sim', reference: 'sim-ref-1' }),
      ),
    };
    store = {
      getSettings: jest.fn(),
      getBusinessHours: jest.fn(),
      getTables: jest.fn(),
      getTablesByIds: jest.fn(() => Promise.resolve([table()])),
    };
    itemsBuilder = { build: jest.fn(() => Promise.resolve([builtItem()])) };
    const config = { get: jest.fn().mockReturnValue('America/Bogota') };

    const module = await Test.createTestingModule({
      providers: [
        CreateInPersonOrderUseCase,
        { provide: ORDER_REPOSITORY, useValue: orders },
        { provide: PAYMENT_GATEWAY, useValue: gateway },
        { provide: STORE_REPOSITORY, useValue: store },
        { provide: OrderItemsBuilder, useValue: itemsBuilder },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    useCase = module.get(CreateInPersonOrderUseCase);
  });

  it('dine_in + mesa → nace confirmed, presencial, con takenBy y tableLabel', async () => {
    const res = await useCase.execute(base);

    expect(orders.createAggregate).toHaveBeenCalledTimes(1);
    const saved = orders.createAggregate.mock.calls[0][0];
    expect(saved.status).toBe(OrderStatus.CONFIRMED);
    expect(saved.channel).toBe(OrderChannel.PRESENCIAL);
    expect(saved.customerId).toBeNull();
    expect(saved.takenBy).toBe('admin1');
    expect(saved.tableId).toBe('t1');
    expect(saved.deliveryFee).toBe(0);
    expect(saved.subtotal).toBe(14000);
    expect(saved.total).toBe(14000);
    expect(saved.orderDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.tableLabel).toBe('Mesa 1');
    expect(res.customerName).toBeNull();
    expect(res.order.channel).toBe('presencial');
  });

  it('pickup presencial → sin mesa ni lookup — y nace PENDING (§036)', async () => {
    const cmd: CreateInPersonOrderCommand = { ...base, serviceType: 'pickup' };
    delete cmd.tableId;

    const res = await useCase.execute(cmd);

    expect(store.getTablesByIds).not.toHaveBeenCalled();
    const saved = orders.createAggregate.mock.calls[0][0];
    expect(saved.tableId).toBeNull();
    // La bandeja es el aviso — la recogida presencial espera el cobro
    // aunque venga paga (confirm-payment la saca de received).
    expect(saved.status).toBe(OrderStatus.PENDING);
    expect(res.tableLabel).toBeNull();
  });

  it('siembra statusChangedAt al nacer (§037.A — nacer = entrar)', async () => {
    const before = Date.now();
    await useCase.execute(base);
    const saved = orders.createAggregate.mock.calls[0][0];
    expect(saved.statusChangedAt).toBeInstanceOf(Date);
    expect(saved.statusChangedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('dine_in sin tableId → InvalidOrderDataException (400)', async () => {
    const cmd = { ...base };
    delete cmd.tableId;
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidOrderDataException,
    );
    expect(orders.createAggregate).not.toHaveBeenCalled();
  });

  it('pickup con tableId → 400', async () => {
    await expect(
      useCase.execute({ ...base, serviceType: 'pickup', tableId: 't1' }),
    ).rejects.toBeInstanceOf(InvalidOrderDataException);
    expect(orders.createAggregate).not.toHaveBeenCalled();
  });

  it('transfer sin payerPhone → 400', async () => {
    await expect(
      useCase.execute({ ...base, paymentMethod: 'transfer' }),
    ).rejects.toBeInstanceOf(InvalidOrderDataException);
  });

  it('cash con payerPhone → 400', async () => {
    await expect(
      useCase.execute({ ...base, payerPhone: '3001234567' }),
    ).rejects.toBeInstanceOf(InvalidOrderDataException);
  });

  it.each([{ found: [] }, { found: [table({ isActive: false })] }])(
    'mesa inexistente/inactiva → TableNotFoundException (404)',
    async ({ found }) => {
      store.getTablesByIds.mockResolvedValue(found);
      await expect(useCase.execute(base)).rejects.toBeInstanceOf(
        TableNotFoundException,
      );
      expect(orders.createAggregate).not.toHaveBeenCalled();
    },
  );

  it('transfer → despacha el push con payerPhone y total', async () => {
    const res = await useCase.execute({
      ...base,
      paymentMethod: 'transfer',
      payerPhone: '3001234567',
    });

    expect(gateway.initiatePush).toHaveBeenCalledWith({
      amount: 14000,
      payerPhone: '3001234567',
    });
    const saved = orders.createAggregate.mock.calls[0][0];
    expect(saved.payment?.status).toBe(PaymentStatus.PENDING);
    expect(saved.payment?.payerPhone).toBe('3001234567');
    expect(saved.payment?.providerReference).toBe('sim-ref-1');
    expect(res.order.payment?.method).toBe('transfer');
  });

  it('cash → no toca el gateway; payment pending sin payerPhone', async () => {
    await useCase.execute(base);

    expect(gateway.initiatePush).not.toHaveBeenCalled();
    const saved = orders.createAggregate.mock.calls[0][0];
    expect(saved.payment?.status).toBe(PaymentStatus.PENDING);
    expect(saved.payment?.payerPhone).toBeNull();
    expect(saved.payment?.provider).toBeNull();
  });

  it('no evalúa horario ni mínimo de delivery (reglas del canal online)', async () => {
    // StoreSettings/BusinessHours ni se consultan — el local atiende.
    await useCase.execute(base);
    expect(store.getSettings).not.toHaveBeenCalled();
    expect(store.getBusinessHours).not.toHaveBeenCalled();
  });
});
