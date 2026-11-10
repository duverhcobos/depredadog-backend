import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  WEBHOOK_STATUSES,
  type WebhookStatus,
} from '../../../payments/domain/enums/webhook-status.enum';

// Contrato normalizado del webhook — el controller lo recibe del
// proveedor y el use-case no ve formatos externos. `status` usa los
// nombres del dominio (el adapter de cada proveedor traduce los suyos
// cuando lleguen las llaves reales).
export class PaymentWebhookDto {
  @IsString()
  @IsNotEmpty()
  reference!: string;

  @IsIn(WEBHOOK_STATUSES)
  status!: WebhookStatus;

  /** Cuerpo crudo para auditoría — queda en provider_payload. */
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
