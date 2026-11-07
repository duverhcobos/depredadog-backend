import { Inject, Injectable } from '@nestjs/common';
import { AddressNotFoundException } from '../../domain/exceptions/address-not-found.exception';
import {
  type IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../domain/repositories/address.repository.interface';

export interface DeleteAddressCommand {
  userId: string;
  addressId: string;
}

@Injectable()
export class DeleteAddressUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY)
    private readonly addresses: IAddressRepository,
  ) {}

  async execute(cmd: DeleteAddressCommand): Promise<void> {
    const address = await this.addresses.findByIdForUser(
      cmd.addressId,
      cmd.userId,
    );
    if (!address) {
      throw new AddressNotFoundException();
    }
    // La transacción interna promueve la más antigua si la borrada
    // era la default — el checkout siempre conserva preselección.
    await this.addresses.delete(address);
  }
}
