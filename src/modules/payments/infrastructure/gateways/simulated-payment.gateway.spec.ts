import { SimulatedPaymentGateway } from './simulated-payment.gateway';

describe('SimulatedPaymentGateway', () => {
  it('devuelve provider sim + referencia sim-<uuid> única por despacho', async () => {
    const gateway = new SimulatedPaymentGateway();
    const first = await gateway.initiatePush({
      amount: 16000,
      payerPhone: '3001234567',
    });
    const second = await gateway.initiatePush({
      amount: 16000,
      payerPhone: '3001234567',
      referenceHint: 'req-1',
    });
    expect(first.provider).toBe('sim');
    expect(first.reference).toMatch(/^sim-/);
    expect(second.reference).toMatch(/^sim-/);
    expect(first.reference).not.toBe(second.reference);
  });
});
