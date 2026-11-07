import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';

export class Payment {
  id!: string;
  orderId!: string;
  method!: PaymentMethod;
  status: PaymentStatus = PaymentStatus.PENDING;
  amount!: number;
  provider: string | null = null;
  providerReference: string | null = null;
  /** Respuesta cruda del proveedor/webhook — auditoría. */
  providerPayload: Record<string, unknown> | null = null;
  evidenceUrl: string | null = null;
  /** Celular que recibe el push (transfer — quién paga, §024). */
  payerPhone: string | null = null;
  confirmedBy: string | null = null;
  confirmedAt: Date | null = null;
  refundedAt: Date | null = null;
  refundReason: string | null = null;
  createdAt!: Date;
  updatedAt!: Date;
}
