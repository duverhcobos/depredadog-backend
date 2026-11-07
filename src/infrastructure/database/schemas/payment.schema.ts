import { EntitySchema } from 'typeorm';
import { Payment } from '../../../modules/payments/domain/entities/payment.entity';
import { PaymentMethod } from '../../../modules/payments/domain/enums/payment-method.enum';
import { PaymentStatus } from '../../../modules/payments/domain/enums/payment-status.enum';

const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const PaymentSchema = new EntitySchema<Payment>({
  name: 'Payment',
  target: Payment,
  tableName: 'payments',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    orderId: { name: 'order_id', type: 'uuid' },
    method: { type: 'enum', enum: PaymentMethod, enumName: 'payment_method' },
    status: {
      type: 'enum',
      enum: PaymentStatus,
      enumName: 'payment_status',
      default: PaymentStatus.PENDING,
    },
    amount: {
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
    },
    provider: { type: 'varchar', length: 50, nullable: true },
    providerReference: {
      name: 'provider_reference',
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    providerPayload: {
      name: 'provider_payload',
      type: 'jsonb',
      nullable: true,
    },
    evidenceUrl: {
      name: 'evidence_url',
      type: 'varchar',
      length: 500,
      nullable: true,
    },
    payerPhone: {
      name: 'payer_phone',
      type: 'varchar',
      length: 20,
      nullable: true,
    },
    confirmedBy: { name: 'confirmed_by', type: 'uuid', nullable: true },
    confirmedAt: { name: 'confirmed_at', type: 'timestamptz', nullable: true },
    refundedAt: { name: 'refunded_at', type: 'timestamptz', nullable: true },
    refundReason: { name: 'refund_reason', type: 'text', nullable: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
