import { AddressType } from '../../domain/enums/address-type.enum';

export class AddressResponseDto {
  id!: string;
  label!: string;
  landmark!: string;
  neighborhood!: string | null;
  type!: AddressType;
  latitude!: number | null;
  longitude!: number | null;
  isDefault!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
