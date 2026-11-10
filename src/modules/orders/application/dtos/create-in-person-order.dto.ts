import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { COLOMBIA_MOBILE, OrderItemDto } from './create-order.dto';

// Pedido que toma el dueño en el local — sin cliente ni dirección.
// dine_in exige tableId; pickup presencial lo prohíbe (la persona se
// lleva el pedido). La validación cruzada de campos va en el
// use-case (mismo patrón que POST /orders).
export class CreateInPersonOrderDto {
  @IsIn(['dine_in', 'pickup'])
  serviceType!: 'dine_in' | 'pickup';

  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsIn(['cash', 'transfer'])
  paymentMethod!: 'cash' | 'transfer';

  @IsOptional()
  @Matches(COLOMBIA_MOBILE)
  payerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
