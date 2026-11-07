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
} from 'class-validator';
import { AddressType } from '../../domain/enums/address-type.enum';

export class CreateAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/\S/)
  label!: string;

  // §022a — la zona no tiene nomenclatura de calles: el punto de
  // referencia ES la dirección ("Casa blanca frente a la cancha").
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/\S/)
  landmark!: string;

  // Barrio/vereda/sector — opcional (§022a).
  @IsString()
  @IsOptional()
  @MaxLength(150)
  neighborhood?: string;

  // Clase de la ubicación — decide el ícono en la app (§022b).
  @IsEnum(AddressType)
  type!: AddressType;

  // Pin de Google opcional (§022d — hoy se adjunta al pedido; la
  // ubicación guardada también puede conservarlo).
  @IsLatitude()
  @IsOptional()
  latitude?: number;

  @IsLongitude()
  @IsOptional()
  longitude?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
