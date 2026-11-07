import { Inject, Injectable } from '@nestjs/common';
import { Address } from '../../domain/entities/address.entity';
import {
  type IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../domain/repositories/address.repository.interface';

export interface ListAddressesCommand {
  userId: string;
}

@Injectable()
export class ListAddressesUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY)
    private readonly addresses: IAddressRepository,
  ) {}

  execute(cmd: ListAddressesCommand): Promise<Address[]> {
    return this.addresses.findAllByUserId(cmd.userId);
  }
}
