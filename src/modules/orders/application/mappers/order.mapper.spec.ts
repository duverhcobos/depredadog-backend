import { Payment } from '../../../payments/domain/entities/payment.entity';
import { PaymentMethod } from '../../../payments/domain/enums/payment-method.enum';
import { PaymentStatus } from '../../../payments/domain/enums/payment-status.enum';
import { Order } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { OrderItemModifier } from '../../domain/entities/order-item-modifier.entity';
import { ModifierAction } from '../../domain/enums/modifier-action.enum';
import { OrderChannel } from '../../domain/enums/order-channel.enum';
import { OrderServiceType } from '../../domain/enums/order-service-type.enum';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { OrderMapper } from './order.mapper';

describe('OrderMapper', () => {
  const mapper = new OrderMapper();

  function order(): Order {
    const o = new Order();
    o.id = 'o1';
    o.orderDate = '2026-11-07';
    o.orderNumber = 3;
    o.channel = OrderChannel.ONLINE;
    o.serviceType = OrderServiceType.DELIVERY;
    o.customerId = 'u1';
    o.contactPhone = '3001234567';
    o.deliveryAddress = 'Casa blanca (Barrio Centro)';
    o.deliveryLocationLink = 'https://maps/x';
    o.subtotal = 16000;
    o.deliveryFee = 2000;
    o.discount = 0;
    o.total = 18000;
    o.createdAt = new Date('2026-11-07T20:00:00Z');

    const m = new OrderItemModifier();
    m.id = 'm1';
    m.optionId = 'opt1';
    m.optionName = 'Tocineta';
    m.action = ModifierAction.ADDED;
    m.priceDelta = 2000;
    m.modifierGroup = 'ingredients';
    m.replacesOptionId = 'opt9';

    const i = new OrderItem();
    i.id = 'i1';
    i.orderId = 'o1';
    i.productId = 'p1';
    i.productName = 'El Cachorro';
    i.productSlug = 'el-cachorro';
    i.includedNames = ['Pan', 'Salchicha'];
    i.unitPrice = 16000;
    i.quantity = 1;
    i.lineTotal = 16000;
    i.modifiers = [m];
    o.items = [i];

    const p = new Payment();
    p.id = 'pay1';
    p.orderId = 'o1';
    p.method = PaymentMethod.TRANSFER;
    p.status = PaymentStatus.PENDING;
    p.amount = 18000;
    p.payerPhone = '3001234567';
    p.provider = 'sim';
    p.providerReference = 'sim-ref-9';
    o.payment = p;
    return o;
  }

  it('mapea la orden completa con ítems, modifiers y payment', () => {
    const dto = mapper.toResponse(order());
    expect(dto.id).toBe('o1');
    expect(dto.orderNumber).toBe(3);
    expect(dto.orderDate).toBe('2026-11-07');
    expect(dto.status).toBe('pending');
    expect(dto.serviceType).toBe('delivery');
    expect(dto.contactPhone).toBe('3001234567');
    expect(dto.deliveryAddress).toBe('Casa blanca (Barrio Centro)');
    expect(dto.deliveryLocationLink).toBe('https://maps/x');
    expect(dto.subtotal).toBe(16000);
    expect(dto.deliveryFee).toBe(2000);
    expect(dto.discount).toBe(0);
    expect(dto.total).toBe(18000);
    expect(dto.createdAt).toEqual(new Date('2026-11-07T20:00:00Z'));

    expect(dto.items).toHaveLength(1);
    const item = dto.items[0];
    expect(item.productName).toBe('El Cachorro');
    expect(item.productSlug).toBe('el-cachorro');
    expect(item.includedNames).toEqual(['Pan', 'Salchicha']);
    expect(item.unitPrice).toBe(16000);
    expect(item.lineTotal).toBe(16000);
    expect(item.notes).toBeNull();
    expect(item.modifiers).toHaveLength(1);
    expect(item.modifiers[0].optionName).toBe('Tocineta');
    expect(item.modifiers[0].action).toBe('added');
    expect(item.modifiers[0].priceDelta).toBe(2000);
    expect(item.modifiers[0].modifierGroup).toBe('ingredients');
    expect(item.modifiers[0].replacesOptionId).toBe('opt9');

    expect(dto.payment).not.toBeNull();
    expect(dto.payment!.method).toBe('transfer');
    expect(dto.payment!.status).toBe('pending');
    expect(dto.payment!.payerPhone).toBe('3001234567');
    expect(dto.payment!.provider).toBe('sim');
    expect(dto.payment!.providerReference).toBe('sim-ref-9');
    // Nunca exponemos customerId ni campos internos.
    expect(dto).not.toHaveProperty('customerId');
    expect(dto).not.toHaveProperty('clientRequestId');
    expect(dto).not.toHaveProperty('channel');
    expect(dto).not.toHaveProperty('addressId');
  });

  it('payment null y modifiers vacíos → null/[]', () => {
    const o = order();
    o.payment = null;
    o.items[0].modifiers = [];
    const dto = mapper.toResponse(o);
    expect(dto.payment).toBeNull();
    expect(dto.items[0].modifiers).toEqual([]);
  });

  it('toListResponse arma el envelope {items,total,page,limit}', () => {
    const dto = mapper.toListResponse({ items: [order()], total: 9 }, 2, 10);
    expect(dto.items).toHaveLength(1);
    expect(dto.total).toBe(9);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(10);
  });
});
