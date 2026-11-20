import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const COLOMBIA_MOBILE = /^3\d{9}$/;

export class OrderItemModifierDto {
  @IsUUID()
  optionId!: string;

  @IsIn(['added', 'removed'])
  action!: 'added' | 'removed';

  /** Porciones del adicional (§026) — solo válido en `added`:
   * entero ≥ 1, SIN tope (decisión del usuario). Ausente = 1.
   * Removed/reemplazo deben venir en 1. */
  @IsInt()
  @Min(1)
  @IsOptional()
  times?: number;

  /** Solo en `added` de un reemplazo gratis (§021): apunta al
   * ingrediente incluido agotado que esta opción reemplaza. */
  @IsUUID()
  @IsOptional()
  replacesOptionId?: string;
}

export class OrderItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  notes?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OrderItemModifierDto)
  modifiers: OrderItemModifierDto[] = [];
}

export class NewAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/\S/)
  landmark!: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  neighborhood?: string;
}

export class CreateOrderDto {
  // Canal online — el cliente solo puede pickup|delivery (dine_in
  // llega con el admin, fuera de esta propuesta).
  @IsIn(['pickup', 'delivery'])
  serviceType!: 'pickup' | 'delivery';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  // delivery — la dirección guardada (mía) o una nueva no guardada.
  @IsUUID()
  @IsOptional()
  addressId?: string;

  @ValidateNested()
  @Type(() => NewAddressDto)
  @IsOptional()
  newAddress?: NewAddressDto;

  // §024 — quién recibe (delivery lo exige).
  @IsString()
  @Matches(COLOMBIA_MOBILE)
  @ValidateIf((o: CreateOrderDto) => o.serviceType === 'delivery')
  contactPhone?: string;

  // Pin de Google adjunto al pedido (§022d).
  @IsString()
  @IsOptional()
  @MaxLength(500)
  deliveryLocationLink?: string;

  // cash solo en delivery (§022c — el local exige transferencia).
  @IsIn(['cash', 'transfer'])
  paymentMethod!: 'cash' | 'transfer';

  // §024 — quién paga cuando transfer.
  @IsString()
  @Matches(COLOMBIA_MOBILE)
  @ValidateIf((o: CreateOrderDto) => o.paymentMethod === 'transfer')
  payerPhone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  /** Idempotencia: la app genera un uuid por checkout; un reintento
   * responde la misma orden. */
  @IsUUID()
  @IsOptional()
  clientRequestId?: string;
}
