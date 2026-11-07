import { Inject, Injectable } from '@nestjs/common';
import { Address } from '../../domain/entities/address.entity';
import { AddressType } from '../../domain/enums/address-type.enum';
import { AddressLimitReachedException } from '../../domain/exceptions/address-limit-reached.exception';
import {
  type IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../domain/repositories/address.repository.interface';

// §014 — regla anti-abuso: máximo de direcciones guardadas por
// cliente (la lista GET nunca excede este tope → sin paginación).
const MAX_ADDRESSES_PER_USER = 10;

export interface CreateAddressCommand {
  userId: string;
  label: string;
  landmark: string;
  neighborhood?: string;
  type: AddressType;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
}

@Injectable()
export class CreateAddressUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY)
    private readonly addresses: IAddressRepository,
  ) {}

  async execute(cmd: CreateAddressCommand): Promise<Address> {
    const count = await this.addresses.countByUserId(cmd.userId);
    if (count >= MAX_ADDRESSES_PER_USER) {
      throw new AddressLimitReachedException();
    }
    const address = new Address();
    address.userId = cmd.userId;
    address.label = cmd.label.trim();
    address.landmark = cmd.landmark.trim();
    address.neighborhood = cmd.neighborhood?.trim() || null;
    address.type = cmd.type;
    address.latitude = cmd.latitude ?? null;
    address.longitude = cmd.longitude ?? null;
    // §014 — la primera dirección del cliente queda default
    // automática (el checkout preselecciona); una explícita gana.
    address.isDefault = cmd.isDefault ?? count === 0;
    return address.isDefault
      ? this.addresses.saveAsExclusiveDefault(address)
      : this.addresses.save(address);
  }
}
