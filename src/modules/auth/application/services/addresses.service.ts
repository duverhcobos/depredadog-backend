import { Injectable } from '@nestjs/common';
import { CreateAddressDto } from '../dtos/create-address.dto';
import { UpdateAddressDto } from '../dtos/update-address.dto';
import { AddressResponseDto } from '../dtos/address-response.dto';
import { AddressMapper } from '../mappers/address.mapper';
import { ListAddressesUseCase } from '../use-cases/list-addresses.use-case';
import { CreateAddressUseCase } from '../use-cases/create-address.use-case';
import { UpdateAddressUseCase } from '../use-cases/update-address.use-case';
import { DeleteAddressUseCase } from '../use-cases/delete-address.use-case';

@Injectable()
export class AddressesService {
  constructor(
    private readonly listAddresses: ListAddressesUseCase,
    private readonly createAddress: CreateAddressUseCase,
    private readonly updateAddress: UpdateAddressUseCase,
    private readonly deleteAddress: DeleteAddressUseCase,
    private readonly mapper: AddressMapper,
  ) {}

  async list(userId: string): Promise<AddressResponseDto[]> {
    const rows = await this.listAddresses.execute({ userId });
    return this.mapper.toResponseList(rows);
  }

  async create(
    userId: string,
    dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    const address = await this.createAddress.execute({ userId, ...dto });
    return this.mapper.toResponse(address);
  }

  async update(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    const address = await this.updateAddress.execute({
      userId,
      addressId,
      ...dto,
    });
    return this.mapper.toResponse(address);
  }

  async remove(userId: string, addressId: string): Promise<void> {
    await this.deleteAddress.execute({ userId, addressId });
  }
}
