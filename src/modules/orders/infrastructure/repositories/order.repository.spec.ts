import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Payment } from '../../../payments/domain/entities/payment.entity';
import { PaymentStatus } from '../../../payments/domain/enums/payment-status.enum';
import { Order } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { OrderItemModifier } from '../../domain/entities/order-item-modifier.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { OrderRepository } from './order.repository';

describe('OrderRepository', () => {
  let repo: OrderRepository;
  let orm: jest.Mocked<Repository<Order>>;
  let items: jest.Mocked<Repository<OrderItem>>;
  let modifiers: jest.Mocked<Repository<OrderItemModifier>>;
  let payments: jest.Mocked<Repository<Payment>>;
  let em: { save: jest.Mock; query: jest.Mock };
  let transaction: jest.Mock;

  function newOrder(): Order {
    const o = new Order();
    o.customerId = 'u1';
    o.orderDate = '2026-11-07';
    o.total = 16000;
    const item = new OrderItem();
    item.productId = 'p1';
    item.modifiers = [new OrderItemModifier()];
    o.items = [item];
    o.payment = new Payment();
    return o;
  }

  beforeEach(async () => {
    let seq = 0;
    em = {
      save: jest.fn((e: { id?: string }) => {
        if (!e.id) e.id = `gen-${++seq}`;
        return Promise.resolve(e);
      }),
      query: jest.fn().mockResolvedValue([{ n: 7 }]),
    };
    transaction = jest.fn((cb: (m: EntityManager) => unknown) =>
      Promise.resolve(cb(em as unknown as EntityManager)),
    );
    orm = {
      manager: { transaction },
      find: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
    } as unknown as jest.Mocked<Repository<Order>>;
    items = { find: jest.fn() } as unknown as jest.Mocked<Repository<OrderItem>>;
    modifiers = { find: jest.fn() } as unknown as jest.Mocked<
      Repository<OrderItemModifier>
    >;
    payments = { find: jest.fn(), findOne: jest.fn() } as unknown as jest.Mocked<
      Repository<Payment>
    >;
    const module = await Test.createTestingModule({
      providers: [
        OrderRepository,
        { provide: getRepositoryToken(Order), useValue: orm },
        { provide: getRepositoryToken(OrderItem), useValue: items },
        {
          provide: getRepositoryToken(OrderItemModifier),
          useValue: modifiers,
        },
        { provide: getRepositoryToken(Payment), useValue: payments },
      ],
    }).compile();
    repo = module.get(OrderRepository);
  });

  it('createAggregate persiste las 4 tablas en una tx con el consecutivo', async () => {
    const order = newOrder();
    const saved = await repo.createAggregate(order);

    expect(transaction).toHaveBeenCalledTimes(1);
    // Consecutivo diario: MAX+1 por order_date.
    expect(em.query).toHaveBeenCalledWith(expect.stringContaining('orders'), [
      '2026-11-07',
    ]);
    expect(order.orderNumber).toBe(7);
    // orders + 1 item + 1 modifier + 1 payment = 4 saves.
    expect(em.save).toHaveBeenCalledTimes(4);
    expect(order.items[0].orderId).toBe(saved.id);
    expect(order.items[0].modifiers[0].orderItemId).toBe(saved.items[0].id);
    expect(order.payment?.orderId).toBe(saved.id);
    expect(saved.items).toBe(order.items);
    expect(saved.payment).toBe(order.payment);
  });

  it('colisión 23505 reintenta con transacción nueva', async () => {
    transaction
      .mockImplementationOnce(() =>
        Promise.reject(
          Object.assign(new Error('dup'), {
            code: '23505',
            constraint: 'uq_orders_day_number',
          }),
        ),
      )
      .mockImplementation((cb: (m: EntityManager) => unknown) =>
        Promise.resolve(cb(em as unknown as EntityManager)),
      );
    const saved = await repo.createAggregate(newOrder());
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(saved.id).toBeDefined();
  });

  it('error no-23505 no reintenta', async () => {
    transaction.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('boom'), { code: 'XX000' })),
    );
    await expect(repo.createAggregate(newOrder())).rejects.toThrow('boom');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('23505 persistente falla al tercer intento', async () => {
    transaction.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('dup'), {
          code: '23505',
          constraint: 'uq_orders_day_number',
        }),
      ),
    );
    await expect(repo.createAggregate(newOrder())).rejects.toThrow('dup');
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('23505 de uq_orders_client_request devuelve la orden ganadora', async () => {
    // Otro request concurrente insertó primero — el índice de
    // idempotencia lo delata y devolvemos SU orden, no un 500.
    const ganadora = Object.assign(new Order(), { id: 'o-ganadora' });
    transaction.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('dup'), {
          code: '23505',
          constraint: 'uq_orders_client_request',
        }),
      ),
    );
    orm.findOne
      .mockResolvedValueOnce(ganadora) // lookup por clientRequestId
      .mockResolvedValue(ganadora); // detalle (items/payments)
    items.find.mockResolvedValue([]);
    payments.find.mockResolvedValue([]);
    const order = newOrder();
    order.clientRequestId = 'req-1';
    const saved = await repo.createAggregate(order);
    expect(saved.id).toBe('o-ganadora');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('findByClientRequest: null si no hay fila; agregado completo si hay', async () => {
    const row = Object.assign(new Order(), { id: 'o1' });
    orm.findOne
      .mockResolvedValueOnce(null) // 1ª llamada: no hay clientRequestId
      .mockResolvedValue(row); // 2ª (lookup) y 3ª (detalle) → la fila
    items.find.mockResolvedValue([]);
    payments.find.mockResolvedValue([]);

    await expect(repo.findByClientRequest('u1', 'req-1')).resolves.toBeNull();
    const found = await repo.findByClientRequest('u1', 'req-1');
    expect(found?.id).toBe('o1');
    // Delegó al detalle: cargó items y payments.
    expect(items.find).toHaveBeenCalled();
    expect(payments.find).toHaveBeenCalled();
  });

  it('findByCustomer active: sin paginar, items sin modifiers + payment', async () => {
    const o = new Order();
    o.id = 'o1';
    orm.find.mockResolvedValue([o]);
    const item = new OrderItem();
    item.id = 'i1';
    item.orderId = 'o1';
    items.find.mockResolvedValue([item]);
    const payment = new Payment();
    payment.orderId = 'o1';
    payments.find.mockResolvedValue([payment]);

    const page = await repo.findByCustomer('u1', 'active', 1, 20);

    expect(orm.find).toHaveBeenCalledTimes(1);
    expect(orm.findAndCount).not.toHaveBeenCalled();
    const call = orm.find.mock.calls[0][0] as {
      where: { customerId: string };
      order: { createdAt: string };
    };
    expect(call.where.customerId).toBe('u1');
    expect(page.total).toBe(1);
    expect(page.items[0].items).toHaveLength(1);
    expect(page.items[0].items[0].modifiers).toEqual([]);
    expect(page.items[0].payment).toBe(payment);
    // Listado no consulta modifiers.
    expect(modifiers.find).not.toHaveBeenCalled();
  });

  it('findByCustomer history: findAndCount paginado con estados done/cancelled', async () => {
    orm.findAndCount.mockResolvedValue([[new Order()], 12]);
    items.find.mockResolvedValue([]);
    payments.find.mockResolvedValue([]);

    const page = await repo.findByCustomer('u1', 'history', 2, 10);

    expect(orm.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(page.total).toBe(12);
    expect(page.items).toHaveLength(1);
  });

  it('findByCustomer vacío: no consulta items/payments', async () => {
    orm.find.mockResolvedValue([]);
    const page = await repo.findByCustomer('u1', 'active', 1, 20);
    expect(page).toEqual({ items: [], total: 0 });
    expect(items.find).not.toHaveBeenCalled();
    expect(payments.find).not.toHaveBeenCalled();
  });

  it('findByIdForCustomer: null cuando ajena/inexistente (IDOR)', async () => {
    orm.findOne.mockResolvedValue(null);
    await expect(repo.findByIdForCustomer('o-x', 'u1')).resolves.toBeNull();
    expect(orm.findOne).toHaveBeenCalledWith({
      where: { id: 'o-x', customerId: 'u1' },
    });
    expect(items.find).not.toHaveBeenCalled();
  });

  it('findByIdForCustomer: detalle carga items + modifiers + payment', async () => {
    const o = new Order();
    o.id = 'o1';
    orm.findOne.mockResolvedValue(o);
    const item = new OrderItem();
    item.id = 'i1';
    item.orderId = 'o1';
    items.find.mockResolvedValue([item]);
    const mod = new OrderItemModifier();
    mod.orderItemId = 'i1';
    modifiers.find.mockResolvedValue([mod]);
    const payment = new Payment();
    payment.orderId = 'o1';
    payments.find.mockResolvedValue([payment]);

    const found = await repo.findByIdForCustomer('o1', 'u1');
    expect(found?.items).toHaveLength(1);
    expect(found?.items[0].modifiers).toEqual([mod]);
    expect(found?.payment).toBe(payment);
  });

  it('round-trip §016: productSlug/includedNames/modifierGroup/replacesOptionId persisten y vuelven', async () => {
    const order = newOrder();
    const item = order.items[0];
    item.id = 'i1';
    item.productSlug = 'el-cachorro';
    item.includedNames = ['Queso mozzarella', 'Salchicha'];
    const mod = item.modifiers[0];
    mod.orderItemId = 'i1';
    mod.modifierGroup = 'ingredients';
    mod.replacesOptionId = 'opt-removed';

    const saved = await repo.createAggregate(order);
    expect(saved.items[0].productSlug).toBe('el-cachorro');
    expect(saved.items[0].includedNames).toEqual([
      'Queso mozzarella',
      'Salchicha',
    ]);
    expect(saved.items[0].modifiers[0].modifierGroup).toBe('ingredients');
    expect(saved.items[0].modifiers[0].replacesOptionId).toBe('opt-removed');

    // ...y vuelven por el detalle (findByIdForCustomer carga modifiers).
    orm.findOne.mockResolvedValue(Object.assign(new Order(), { id: 'o1' }));
    item.orderId = 'o1';
    items.find.mockResolvedValue([item]);
    modifiers.find.mockResolvedValue([mod]);
    payments.find.mockResolvedValue([]);

    const found = await repo.findByIdForCustomer('o1', 'u1');
    expect(found?.items[0].productSlug).toBe('el-cachorro');
    expect(found?.items[0].includedNames).toEqual([
      'Queso mozzarella',
      'Salchicha',
    ]);
    expect(found?.items[0].modifiers[0].modifierGroup).toBe('ingredients');
    expect(found?.items[0].modifiers[0].replacesOptionId).toBe('opt-removed');
  });

  it('saveAggregate guarda orden + payment en una tx', async () => {
    const order = newOrder();
    order.status = OrderStatus.CANCELLED;
    order.payment!.status = PaymentStatus.FAILED;
    const saved = await repo.saveAggregate(order);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(em.save).toHaveBeenCalledTimes(2); // order + payment
    expect(saved.payment?.status).toBe(PaymentStatus.FAILED);
  });
});
