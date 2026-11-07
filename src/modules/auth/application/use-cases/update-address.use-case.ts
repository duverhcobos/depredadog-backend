import { Inject, Injectable } from '@nestjs/common';
import { Address } from '../../domain/entities/address.entity';
import { AddressType } from '../../domain/enums/address-type.enum';
import { AddressNotFoundException } from '../../domain/exceptions/address-not-found.exception';
import {
  type IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../domain/repositories/address.repository.interface';

export interface UpdateAddressCommand {
  userId: string;
  addressId: string;
  label?: string;
  landmark?: string;
  neighborhood?: string | null;
  type?: AddressType;
  latitude?: number | null;
  longitude?: number | null;
  isDefault?: boolean;
}

@Injectable()
export class UpdateAddressUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY)
    private readonly addresses: IAddressRepository,
  ) {}

  async execute(cmd: UpdateAddressCommand): Promise<Address> {
    // IDOR: findByIdForUser filtra por dueño — una dirección ajena
    // responde 404 igual que una inexistente (anti-enumeración).
    const address = await this.addresses.findByIdForUser(
      cmd.addressId,
      cmd.userId,
    );
    if (!address) {
      throw new AddressNotFoundException();
    }
    if (cmd.label !== undefined) address.label = cmd.label.trim();
    if (cmd.landmark !== undefined) address.landmark = cmd.landmark.trim();
    if (cmd.neighborhood !== undefined) {
      address.neighborhood = cmd.neighborhood?.trim() || null;
    }
    if (cmd.type !== undefined) address.type = cmd.type;
    if (cmd.latitude !== undefined) address.latitude = cmd.latitude;
    if (cmd.longitude !== undefined) address.longitude = cmd.longitude;
    if (cmd.isDefault !== undefined) address.isDefault = cmd.isDefault;
    // Si quedó marcada default, la exclusividad limpia las demás en
    // la misma transacción (índice parcial único lo respalda).
    return address.isDefault
      ? this.addresses.saveAsExclusiveDefault(address)
      : this.addresses.save(address);
  }
}
