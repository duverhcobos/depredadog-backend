import { BusinessHour } from '../entities/business-hour.entity';
import { StoreSchedule } from './store-schedule.service';

// America/Bogota = UTC-5 fijo (sin DST): los instantes de los casos se
// escriben con offset -05:00 y equivalen a la hora de pared indicada.
const TZ = 'America/Bogota';

const at = (ymd: string, hhmm: string): Date =>
  new Date(`${ymd}T${hhmm}:00-05:00`);

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

// Semana placeholder del seed: dom 16–23, lunes cerrado, mar–sáb 17–23.
// Nov 2026: 1=dom, 2=lun, 3=mar, 4=mié.
const week: BusinessHour[] = [
  hour(0, '16:00:00', '23:00:00'),
  hour(1, '00:00:00', '00:00:00', true),
  hour(2),
  hour(3),
  hour(4),
  hour(5),
  hour(6),
];

describe('StoreSchedule', () => {
  describe('isOpenNow', () => {
    it('dentro del rango → abierto (martes 18:00 con 17–23)', () => {
      expect(StoreSchedule.isOpenNow(week, at('2026-11-03', '18:00'), TZ)).toBe(
        true,
      );
    });

    it('abre exactamente a opens_at → abierto (borde inclusivo)', () => {
      expect(StoreSchedule.isOpenNow(week, at('2026-11-03', '17:00'), TZ)).toBe(
        true,
      );
    });

    it('antes del rango → cerrado (martes 16:59)', () => {
      expect(StoreSchedule.isOpenNow(week, at('2026-11-03', '16:59'), TZ)).toBe(
        false,
      );
    });

    it('a closes_at → cerrado (borde exclusivo, martes 23:00)', () => {
      expect(StoreSchedule.isOpenNow(week, at('2026-11-03', '23:00'), TZ)).toBe(
        false,
      );
    });

    it('día is_closed → cerrado aunque la hora "encaje" (lunes 20:00)', () => {
      expect(StoreSchedule.isOpenNow(week, at('2026-11-02', '20:00'), TZ)).toBe(
        false,
      );
    });

    it('respeta opens_at distinto por día (domingo abre 16:00)', () => {
      expect(StoreSchedule.isOpenNow(week, at('2026-11-01', '15:59'), TZ)).toBe(
        false,
      );
      expect(StoreSchedule.isOpenNow(week, at('2026-11-01', '16:00'), TZ)).toBe(
        true,
      );
    });

    it('sin filas de horario → cerrado', () => {
      expect(StoreSchedule.isOpenNow([], at('2026-11-03', '18:00'), TZ)).toBe(
        false,
      );
    });
  });

  describe('rango que cruza medianoche (17:00 → 02:00)', () => {
    // Martes cierra 02:00 del miércoles; el resto de la semana igual.
    const nightWeek: BusinessHour[] = [
      hour(0, '16:00:00', '23:00:00'),
      hour(1, '00:00:00', '00:00:00', true),
      hour(2, '17:00:00', '02:00:00'),
      hour(3),
      hour(4),
      hour(5),
      hour(6),
    ];

    it('abierto a las 18:00 del mismo día (gobernado por la fila de hoy)', () => {
      const now = at('2026-11-03', '18:00');
      expect(StoreSchedule.isOpenNow(nightWeek, now, TZ)).toBe(true);
      expect(StoreSchedule.governingPeriod(nightWeek, now, TZ)?.dayOfWeek).toBe(
        2,
      );
    });

    it('abierto a la 01:00 del día siguiente (gobernado por la fila de ayer)', () => {
      const now = at('2026-11-04', '01:00');
      expect(StoreSchedule.isOpenNow(nightWeek, now, TZ)).toBe(true);
      // La fila que gobierna es la del martes, no la del miércoles.
      expect(StoreSchedule.governingPeriod(nightWeek, now, TZ)?.dayOfWeek).toBe(
        2,
      );
    });

    it('cerrado a las 02:00 (borde exclusivo) y después', () => {
      expect(
        StoreSchedule.isOpenNow(nightWeek, at('2026-11-04', '02:00'), TZ),
      ).toBe(false);
      expect(
        StoreSchedule.isOpenNow(nightWeek, at('2026-11-04', '03:00'), TZ),
      ).toBe(false);
    });

    it('la cola de ayer cuenta aunque hoy esté cerrado (lunes 01:00 tras domingo 17–02)', () => {
      const sundayNight: BusinessHour[] = [
        hour(0, '17:00:00', '02:00:00'),
        hour(1, '00:00:00', '00:00:00', true),
      ];
      const now = at('2026-11-02', '01:00'); // lunes 01:00
      expect(StoreSchedule.isOpenNow(sundayNight, now, TZ)).toBe(true);
      expect(
        StoreSchedule.governingPeriod(sundayNight, now, TZ)?.dayOfWeek,
      ).toBe(0);
      // Pasada la cola, el lunes cerrado manda.
      expect(
        StoreSchedule.isOpenNow(sundayNight, at('2026-11-02', '03:00'), TZ),
      ).toBe(false);
    });
  });

  describe('today', () => {
    it('devuelve la fila del día de hoy en la tz del negocio', () => {
      const today = StoreSchedule.today(week, at('2026-11-03', '10:00'), TZ);
      expect(today?.dayOfWeek).toBe(2);
      expect(today?.opensAt).toBe('17:00:00');
    });

    it('null si falta la fila del día', () => {
      const onlyTuesday = [hour(2)];
      expect(
        StoreSchedule.today(onlyTuesday, at('2026-11-04', '10:00'), TZ),
      ).toBeNull();
    });
  });
});
