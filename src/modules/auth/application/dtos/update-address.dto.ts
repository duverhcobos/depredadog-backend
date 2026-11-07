import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { AddressType } from '../../domain/enums/address-type.enum';

// PATCH parcial: campo ausente = no tocar. En los campos NULLABLES
// `null` explícito LIMPIA el valor; en los demás `null` es inválido —
// por eso usan @ValidateIf(≠ undefined) en vez de @IsOptional()
// (que traga null y lo dejaría llegar al use-case → 500).
export class UpdateAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/\S/)
  @ValidateIf((o: UpdateAddressDto) => o.label !== undefined)
  label?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/\S/)
  @ValidateIf((o: UpdateAddressDto) => o.landmark !== undefined)
  landmark?: string;

  // null explícito = quitar el sector.
  @IsString()
  @MaxLength(150)
  @IsOptional()
  neighborhood?: string | null;

  @IsEnum(AddressType)
  @ValidateIf((o: UpdateAddressDto) => o.type !== undefined)
  type?: AddressType;

  @IsLatitude()
  @IsOptional()
  latitude?: number | null;

  @IsLongitude()
  @IsOptional()
  longitude?: number | null;

  @IsBoolean()
  @ValidateIf((o: UpdateAddressDto) => o.isDefault !== undefined)
  isDefault?: boolean;
}
