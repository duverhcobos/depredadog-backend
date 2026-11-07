import { Address } from '../../domain/entities/address.entity';
import { AddressType } from '../../domain/enums/address-type.enum';
import { AddressMapper } from './address.mapper';

describe('AddressMapper', () => {
  const mapper = new AddressMapper();

  function address(): Address {
    const a = new Address();
    a.id = 'a1';
    a.userId = 'u1';
    a.label = 'Casa';
    a.landmark = 'Casa blanca frente a la cancha';
    a.neighborhood = 'Barrio Centro';
    a.type = AddressType.WORK;
    a.latitude = 4.123456;
    a.longitude = -74.123456;
    a.isDefault = true;
    a.createdAt = new Date('2026-01-01T00:00:00Z');
    a.updatedAt = new Date('2026-01-02T00:00:00Z');
    return a;
  }

  it('mapea todos los campos del dominio a la respuesta', () => {
    const dto = mapper.toResponse(address());
    expect(dto.id).toBe('a1');
    expect(dto.label).toBe('Casa');
    expect(dto.landmark).toBe('Casa blanca frente a la cancha');
    expect(dto.neighborhood).toBe('Barrio Centro');
    expect(dto.type).toBe('work');
    expect(dto.latitude).toBe(4.123456);
    expect(dto.longitude).toBe(-74.123456);
    expect(dto.isDefault).toBe(true);
    expect(dto.createdAt).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(dto.updatedAt).toEqual(new Date('2026-01-02T00:00:00Z'));
    expect(dto).not.toHaveProperty('userId');
  });

  it('nulos nullable pasan como null', () => {
    const a = address();
    a.neighborhood = null;
    a.latitude = null;
    a.longitude = null;
    const dto = mapper.toResponse(a);
    expect(dto.neighborhood).toBeNull();
    expect(dto.latitude).toBeNull();
    expect(dto.longitude).toBeNull();
  });

  it('toResponseList mapea cada fila y tolera lista vacía', () => {
    const list = mapper.toResponseList([address(), address()]);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('a1');
    expect(mapper.toResponseList([])).toEqual([]);
  });
});
