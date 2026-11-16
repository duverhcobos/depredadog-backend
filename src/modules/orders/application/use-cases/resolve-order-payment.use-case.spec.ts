import { Test } from '@nestjs/testing';
import { Payment } from '../../../payments/domain/entities/payment.entity';
import { PaymentStatus } from '../../../payments/domain/enums/payment-status.enum';
import { Order } from '../../domain/entities/order.entity';
import { OrderChannel } from '../../domain/enums/order-channel.enum';
import { OrderServiceType } from '../../domain/enums/order-service-type.enum';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { PaymentNotFoundException } from '../../domain/exceptions/payment-not-found.exception';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../domain/repositories/order.repository.interface';
import { ResolveOrderPaymentUseCase } from './resolve-order-payment.use-case';

function pendingOrder(): Order {
  const o = new Order();
  o.id = 'o1';
  o.customerId = 'u1';
  o.status = OrderStatus.PENDING;
  const p = new Payment();
  p.status = PaymentStatus.PENDING;
  p.provider = 'sim';
  p.providerReference = 'sim-ref-1';
  o.payment = p;
  return o;
}

describe('ResolveOrderPaymentUseCase', () => {
  let useCase: ResolveOrderPaymentUseCase;
  let orders: jest.Mocked<IOrderRepository>;

  beforeEach(async () => {
    orders = {
      findByClientRequest: jest.fn(),
      createAggregate: jest.fn(),
      findByCustomer: jest.fn(),
      findByIdForCustomer: jest.fn(),
      findByProviderReference: jest.fn(),
      cancelPendingAggregate: jest.fn(),
      resolvePaymentAggregate: jest.fn((o) => Promise.resolve(o)),
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
        ResolveOrderPaymentUseCase,
        { provide: ORDER_REPOSITORY, useValue: orders },
      ],
    }).compile();
    useCase = module.get(ResolveOrderPaymentUseCase);
  });

  it('approved → payment paid + confirmedAt y orden confirmed en la misma tx', async () => {
    const order = pendingOrder();
    orders.findByProviderReference.mockResolvedValue(order);
    const saved = await useCase.execute({
      provider: 'sim',
      reference: 'sim-ref-1',
      status: 'approved',
      payload: { raw: 'body' },
    });
    expect(orders.findByProviderReference).toHaveBeenCalledWith(
      'sim',
      'sim-ref-1',
    );
    expect(saved.payment?.status).toBe(PaymentStatus.PAID);
    expect(saved.payment?.confirmedAt).toBeInstanceOf(Date);
    expect(saved.payment?.providerPayload).toEqual({ raw: 'body' });
    expect(saved.status).toBe(OrderStatus.CONFIRMED);
    expect(saved.statusChangedAt).toBeInstanceOf(Date);
    expect(orders.resolvePaymentAggregate).toHaveBeenCalledWith(order);
  });

  it('approved en recogida presencial → payment paid pero la orden SIGUE pending (§037.D)', async () => {
    const order = pendingOrder();
    order.channel = OrderChannel.PRESENCIAL;
    order.serviceType = OrderServiceType.PICKUP;
    orders.findByProviderReference.mockResolvedValue(order);
    const saved = await useCase.execute({
      provider: 'sim',
      reference: 'sim-ref-1',
      status: 'approved',
    });
    // La bandeja es el aviso — el dueño confirma a mano aunque el
    // pago ya llegó.
    expect(saved.payment?.status).toBe(PaymentStatus.PAID);
    expect(saved.status).toBe(OrderStatus.PENDING);
    expect(orders.resolvePaymentAggregate).toHaveBeenCalledWith(order);
  });

  it.each([
    ['rejected', 'Pago rechazado por el proveedor'],
    ['expired', 'El pago expiró sin aprobación'],
    ['cancelled', 'Pago cancelado por el proveedor'],
  ] as const)(
    '%s → payment failed + orden cancelled con razón en español',
    async (status, reason) => {
      const order = pendingOrder();
      orders.findByProviderReference.mockResolvedValue(order);
      const saved = await useCase.execute({
        provider: 'sim',
        reference: 'sim-ref-1',
        status,
      });
      expect(saved.payment?.status).toBe(PaymentStatus.FAILED);
      expect(saved.status).toBe(OrderStatus.CANCELLED);
      expect(saved.cancelReason).toBe(reason);
      // Sin payload en el body → provider_payload null, no undefined.
      expect(saved.payment?.providerPayload).toBeNull();
      expect(orders.resolvePaymentAggregate).toHaveBeenCalledWith(order);
    },
  );

  it('referencia desconocida (sin orden o sin payment) → PaymentNotFoundException (404)', async () => {
    orders.findByProviderReference.mockResolvedValue(null);
    await expect(
      useCase.execute({
        provider: 'sim',
        reference: 'sim-x',
        status: 'approved',
      }),
    ).rejects.toBeInstanceOf(PaymentNotFoundException);
    // Orden huérfana sin payment también es 404.
    const orphaned = new Order();
    orphaned.payment = null;
    orders.findByProviderReference.mockResolvedValue(orphaned);
    await expect(
      useCase.execute({
        provider: 'sim',
        reference: 'sim-x',
        status: 'approved',
      }),
    ).rejects.toBeInstanceOf(PaymentNotFoundException);
    expect(orders.resolvePaymentAggregate).not.toHaveBeenCalled();
  });

  it('pago ya resuelto → 200 idempotente: devuelve la orden sin tocarla', async () => {
    const order = pendingOrder();
    order.status = OrderStatus.CONFIRMED;
    order.payment!.status = PaymentStatus.PAID;
    orders.findByProviderReference.mockResolvedValue(order);
    const saved = await useCase.execute({
      provider: 'sim',
      reference: 'sim-ref-1',
      status: 'rejected', // un retry contradictorio tampoco revierte
    });
    expect(saved).toBe(order);
    expect(saved.payment?.status).toBe(PaymentStatus.PAID);
    expect(saved.status).toBe(OrderStatus.CONFIRMED);
    expect(orders.resolvePaymentAggregate).not.toHaveBeenCalled();
  });

  it('orden ya cancelada por el cliente + approved → payment paid sin resucitar la orden', async () => {
    const order = pendingOrder();
    order.status = OrderStatus.CANCELLED;
    order.cancelReason = 'Me equivoqué de dirección';
    orders.findByProviderReference.mockResolvedValue(order);
    const saved = await useCase.execute({
      provider: 'sim',
      reference: 'sim-ref-1',
      status: 'approved',
    });
    expect(saved.payment?.status).toBe(PaymentStatus.PAID);
    expect(saved.status).toBe(OrderStatus.CANCELLED);
    expect(saved.cancelReason).toBe('Me equivoqué de dirección');
    expect(orders.resolvePaymentAggregate).toHaveBeenCalledWith(order);
  });

  it('orden ya cancelada + rejected → payment failed sin tocar status ni cancelReason', async () => {
    const order = pendingOrder();
    order.status = OrderStatus.CANCELLED;
    order.cancelReason = 'Me equivoqué de dirección';
    orders.findByProviderReference.mockResolvedValue(order);
    const saved = await useCase.execute({
      provider: 'sim',
      reference: 'sim-ref-1',
      status: 'rejected',
    });
    expect(saved.payment?.status).toBe(PaymentStatus.FAILED);
    expect(saved.status).toBe(OrderStatus.CANCELLED);
    expect(saved.cancelReason).toBe('Me equivoqué de dirección');
  });

  it('claim perdido (resolvePaymentAggregate → null) → re-lee y responde el estado ganador', async () => {
    const order = pendingOrder();
    // El cancel del cliente ganó la carrera entre el read y el write.
    const winner = pendingOrder();
    winner.status = OrderStatus.CANCELLED;
    winner.cancelReason = 'Cancelado por el cliente';
    winner.payment!.status = PaymentStatus.FAILED;
    orders.findByProviderReference
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(winner);
    orders.resolvePaymentAggregate.mockResolvedValue(null);
    const saved = await useCase.execute({
      provider: 'sim',
      reference: 'sim-ref-1',
      status: 'approved',
    });
    expect(saved).toBe(winner);
    expect(saved.status).toBe(OrderStatus.CANCELLED);
    expect(orders.findByProviderReference).toHaveBeenCalledTimes(2);
  });
});
