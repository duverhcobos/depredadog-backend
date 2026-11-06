import { StoreMapper } from './store.mapper';
import { BusinessHour } from '../../domain/entities/business-hour.entity';
import { StoreSettings } from '../../domain/entities/store-settings.entity';

describe('StoreMapper', () => {
  const mapper = new StoreMapper();

  function settings(): StoreSettings {
    const s = new StoreSettings();
    s.id = 's1';
    s.name = 'Depredadog';
    s.phone = null;
    s.address = 'Cl. 7ª, Pueblo Nuevo, Arauquita, Arauca';
    s.logoUrl = null;
    s.deliveryFee = 2000;
    s.minDeliveryOrder = null;
    return s;
  }

  function hour(
    dayOfWeek: number,
    opensAt = '17:00:00',
    closesAt = '23:00:00',
    isClosed = false,
  ): BusinessHour {
    const h = new BusinessHour();
    h.dayOfWeek = dayOfWeek;
    h.opensAt = opensAt;
    h.closesAt = closesAt;
    h.isClosed = isClosed;
    return h;
  }

  it('recorta el time de PG (HH:MM:SS) a HH:MM en opensAt/closesAt', () => {
    const dto = mapper.toConfigResponse(
      settings(),
      [hour(2)],
      true,
      hour(2, '16:30:00', '23:45:00'),
    );

    expect(dto.today).toEqual({
      dayOfWeek: 2,
      opensAt: '16:30',
      closesAt: '23:45',
      isClosed: false,
    });
    expect(dto.weeklyHours[0].opensAt).toBe('17:00');
    expect(dto.weeklyHours[0].closesAt).toBe('23:00');
  });

  it('today null → dto.today null', () => {
    const dto = mapper.toConfigResponse(settings(), [hour(2)], false, null);

    expect(dto.today).toBeNull();
    expect(dto.isOpen).toBe(false);
  });

  it('los campos de settings pasan tal cual (minDeliveryOrder null incluido)', () => {
    const dto = mapper.toConfigResponse(settings(), [], true, null);

    expect(dto.name).toBe('Depredadog');
    expect(dto.phone).toBeNull();
    expect(dto.address).toBe('Cl. 7ª, Pueblo Nuevo, Arauquita, Arauca');
    expect(dto.logoUrl).toBeNull();
    expect(dto.deliveryFee).toBe(2000);
    expect(dto.minDeliveryOrder).toBeNull();
    expect(dto.isOpen).toBe(true);
    expect(dto.weeklyHours).toEqual([]);
  });

  it('weeklyHours mapea cada fila con dayOfWeek e isClosed', () => {
    const dto = mapper.toConfigResponse(
      settings(),
      [hour(0, '16:00:00', '23:00:00'), hour(1, '00:00:00', '00:00:00', true)],
      true,
      hour(0, '16:00:00', '23:00:00'),
    );

    expect(dto.weeklyHours).toEqual([
      { dayOfWeek: 0, opensAt: '16:00', closesAt: '23:00', isClosed: false },
      { dayOfWeek: 1, opensAt: '00:00', closesAt: '00:00', isClosed: true },
    ]);
  });
});
