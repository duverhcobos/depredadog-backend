import { AddressType } from '../enums/address-type.enum';

export class Address {
  id!: string;
  userId!: string;
  label!: string;
  // §022a — la zona no tiene nomenclatura: el punto de referencia ES
  // la dirección ("Casa blanca frente a la cancha").
  landmark!: string;
  // Barrio/vereda/sector — opcional.
  neighborhood: string | null = null;
  type: AddressType = AddressType.OTHER;
  latitude: number | null = null;
  longitude: number | null = null;
  isDefault = false;
  createdAt!: Date;
  updatedAt!: Date;
}
