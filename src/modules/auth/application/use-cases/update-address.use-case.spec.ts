import { Test } from '@nestjs/testing';
import { Address } from '../../domain/entities/address.entity';
import { AddressType } from '../../domain/enums/address-type.enum';
import { AddressNotFoundException } from '../../domain/exceptions/address-not-found.exception';
import {
  IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../domain/repositories/address.repository.interface';
import { UpdateAddressUseCase } from './update-address.use-case';

describe('UpdateAddressUseCase', () => {
  let useCase: UpdateAddressUseCase;
  let addresses: jest.Mocked<IAddressRepository>;

  function existing(): Address {
    const a = new Address();
    a.id = 'a1';
    a.userId = 'u1';
    a.label = 'Casa';
    a.landmark = 'Casa blanca';
    a.neighborhood = 'Barrio Centro';
    a.type = AddressType.HOME;
    a.latitude = 4.5;
    a.longitude = -74.1;
    a.isDefault = false;
    return a;
  }

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
        UpdateAddressUseCase,
        { provide: ADDRESS_REPOSITORY, useValue: addresses },
      ],
    }).compile();
    useCase = module.get(UpdateAddressUseCase);
  });

  it('404 si la dirección no existe o es ajena (anti-enumeración)', async () => {
    addresses.findByIdForUser.mockResolvedValue(null);
    await expect(
      useCase.execute({ userId: 'u1', addressId: 'a1' }),
    ).rejects.toBeInstanceOf(AddressNotFoundException);
    expect(addresses.save).not.toHaveBeenCalled();
  });

  it('busca con filtro de dueño', async () => {
    addresses.findByIdForUser.mockResolvedValue(existing());
    addresses.save.mockImplementation((a) => Promise.resolve(a));
    await useCase.execute({ userId: 'u1', addressId: 'a1' });
    expect(addresses.findByIdForUser).toHaveBeenCalledWith('a1', 'u1');
  });

  it('campos ausentes no se tocan', async () => {
    addresses.findByIdForUser.mockResolvedValue(existing());
    addresses.save.mockImplementation((a) => Promise.resolve(a));
    const saved = await useCase.execute({
      userId: 'u1',
      addressId: 'a1',
      landmark: '  Nueva referencia  ',
    });
    expect(saved.landmark).toBe('Nueva referencia');
    expect(saved.label).toBe('Casa');
    expect(saved.neighborhood).toBe('Barrio Centro');
    expect(saved.type).toBe(AddressType.HOME);
    expect(saved.latitude).toBe(4.5);
    expect(saved.longitude).toBe(-74.1);
    expect(saved.isDefault).toBe(false);
  });

  it('null explícito limpia los campos nullable', async () => {
    addresses.findByIdForUser.mockResolvedValue(existing());
    addresses.save.mockImplementation((a) => Promise.resolve(a));
    const saved = await useCase.execute({
      userId: 'u1',
      addressId: 'a1',
      neighborhood: null,
      latitude: null,
      longitude: null,
    });
    expect(saved.neighborhood).toBeNull();
    expect(saved.latitude).toBeNull();
    expect(saved.longitude).toBeNull();
  });

  it('isDefault: true persiste vía repo exclusivo', async () => {
    addresses.findByIdForUser.mockResolvedValue(existing());
    addresses.saveAsExclusiveDefault.mockImplementation((a) =>
      Promise.resolve(a),
    );
    const saved = await useCase.execute({
      userId: 'u1',
      addressId: 'a1',
      isDefault: true,
    });
    expect(saved.isDefault).toBe(true);
    expect(addresses.saveAsExclusiveDefault).toHaveBeenCalled();
    expect(addresses.save).not.toHaveBeenCalled();
  });

  it('isDefault: false sobre la default se permite (save normal)', async () => {
    const a = existing();
    a.isDefault = true;
    addresses.findByIdForUser.mockResolvedValue(a);
    addresses.save.mockImplementation((x) => Promise.resolve(x));
    const saved = await useCase.execute({
      userId: 'u1',
      addressId: 'a1',
      isDefault: false,
    });
    expect(saved.isDefault).toBe(false);
    expect(addresses.save).toHaveBeenCalled();
    expect(addresses.saveAsExclusiveDefault).not.toHaveBeenCalled();
  });
});
