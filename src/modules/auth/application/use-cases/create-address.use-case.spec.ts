import { Test } from '@nestjs/testing';
import { AddressType } from '../../domain/enums/address-type.enum';
import { AddressLimitReachedException } from '../../domain/exceptions/address-limit-reached.exception';
import {
  IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../domain/repositories/address.repository.interface';
import { CreateAddressUseCase } from './create-address.use-case';

describe('CreateAddressUseCase', () => {
  let useCase: CreateAddressUseCase;
  let addresses: jest.Mocked<IAddressRepository>;

  const base = {
    userId: 'u1',
    label: 'Casa',
    landmark: 'Casa blanca frente a la cancha',
    type: AddressType.HOME,
  };

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
        CreateAddressUseCase,
        { provide: ADDRESS_REPOSITORY, useValue: addresses },
      ],
    }).compile();
    useCase = module.get(CreateAddressUseCase);
  });

  it('409 cuando el usuario ya tiene 10 direcciones', async () => {
    addresses.countByUserId.mockResolvedValue(10);
    await expect(useCase.execute(base)).rejects.toBeInstanceOf(
      AddressLimitReachedException,
    );
    expect(addresses.save).not.toHaveBeenCalled();
    expect(addresses.saveAsExclusiveDefault).not.toHaveBeenCalled();
  });

  it('la primera dirección queda default automática (repo exclusivo)', async () => {
    addresses.countByUserId.mockResolvedValue(0);
    addresses.saveAsExclusiveDefault.mockImplementation((a) =>
      Promise.resolve(a),
    );
    const saved = await useCase.execute(base);
    expect(saved.isDefault).toBe(true);
    expect(addresses.saveAsExclusiveDefault).toHaveBeenCalled();
    expect(addresses.save).not.toHaveBeenCalled();
  });

  it('la segunda sin flag no es default y va por save()', async () => {
    addresses.countByUserId.mockResolvedValue(1);
    addresses.save.mockImplementation((a) => Promise.resolve(a));
    const saved = await useCase.execute(base);
    expect(saved.isDefault).toBe(false);
    expect(addresses.save).toHaveBeenCalled();
    expect(addresses.saveAsExclusiveDefault).not.toHaveBeenCalled();
  });

  it('isDefault explícita gana aunque no sea la primera', async () => {
    addresses.countByUserId.mockResolvedValue(3);
    addresses.saveAsExclusiveDefault.mockImplementation((a) =>
      Promise.resolve(a),
    );
    const saved = await useCase.execute({ ...base, isDefault: true });
    expect(saved.isDefault).toBe(true);
    expect(addresses.saveAsExclusiveDefault).toHaveBeenCalled();
  });

  it('trimea label/landmark/neighborhood y normaliza vacío a null', async () => {
    addresses.countByUserId.mockResolvedValue(1);
    addresses.save.mockImplementation((a) => Promise.resolve(a));
    const saved = await useCase.execute({
      ...base,
      label: '  Trabajo  ',
      landmark: '  Edificio azul  ',
      neighborhood: '   ',
    });
    expect(saved.label).toBe('Trabajo');
    expect(saved.landmark).toBe('Edificio azul');
    expect(saved.neighborhood).toBeNull();
    expect(saved.latitude).toBeNull();
    expect(saved.longitude).toBeNull();
    expect(saved.type).toBe(AddressType.HOME);
    expect(saved.userId).toBe('u1');
  });
});
