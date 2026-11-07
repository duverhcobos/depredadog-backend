import { Test } from '@nestjs/testing';
import { Address } from '../../domain/entities/address.entity';
import { AddressNotFoundException } from '../../domain/exceptions/address-not-found.exception';
import {
  IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../domain/repositories/address.repository.interface';
import { DeleteAddressUseCase } from './delete-address.use-case';

describe('DeleteAddressUseCase', () => {
  let useCase: DeleteAddressUseCase;
  let addresses: jest.Mocked<IAddressRepository>;

  beforeEach(async () => {
    addresses = {
      findAllByUserId: jest.fn(),
      findByIdForUser: jest.fn(),
      countByUserId: jest.fn(),
      save: jest.fn(),
      saveAsExclusiveDefault: jest.fn(),
      delete: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        DeleteAddressUseCase,
        { provide: ADDRESS_REPOSITORY, useValue: addresses },
      ],
    }).compile();
    useCase = module.get(DeleteAddressUseCase);
  });

  it('404 si la dirección no existe o es ajena', async () => {
    addresses.findByIdForUser.mockResolvedValue(null);
    await expect(
      useCase.execute({ userId: 'u1', addressId: 'a1' }),
    ).rejects.toBeInstanceOf(AddressNotFoundException);
    expect(addresses.delete).not.toHaveBeenCalled();
  });

  it('delega el borrado al repo con la entidad hallada', async () => {
    const a = new Address();
    a.id = 'a1';
    a.userId = 'u1';
    addresses.findByIdForUser.mockResolvedValue(a);
    await useCase.execute({ userId: 'u1', addressId: 'a1' });
    expect(addresses.findByIdForUser).toHaveBeenCalledWith('a1', 'u1');
    expect(addresses.delete).toHaveBeenCalledWith(a);
  });
});
