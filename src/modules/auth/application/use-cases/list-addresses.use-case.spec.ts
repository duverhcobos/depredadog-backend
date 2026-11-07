import { Test } from '@nestjs/testing';
import { Address } from '../../domain/entities/address.entity';
import {
  IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../domain/repositories/address.repository.interface';
import { ListAddressesUseCase } from './list-addresses.use-case';

describe('ListAddressesUseCase', () => {
  let useCase: ListAddressesUseCase;
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
        ListAddressesUseCase,
        { provide: ADDRESS_REPOSITORY, useValue: addresses },
      ],
    }).compile();
    useCase = module.get(ListAddressesUseCase);
  });

  it('delega al repo con el userId del comando', async () => {
    const rows = [new Address(), new Address()];
    addresses.findAllByUserId.mockResolvedValue(rows);
    const result = await useCase.execute({ userId: 'u1' });
    expect(addresses.findAllByUserId).toHaveBeenCalledWith('u1');
    expect(result).toBe(rows);
  });
});
