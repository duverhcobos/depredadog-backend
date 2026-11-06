import { BusinessHour } from '../entities/business-hour.entity';

interface ZonedMoment {
  dayOfWeek: number;
  minutes: number; // minutos desde 00:00 del día de negocio
}

// Lógica pura de horario — sin dependencias, testeable al 100%.
export class StoreSchedule {
  /** Hora de pared del local en su timezone (sin librerías: Intl/Date). */
  static zonedNow(now: Date, timeZone: string): ZonedMoment {
    const zoned = new Date(now.toLocaleString('en-US', { timeZone }));
    return {
      dayOfWeek: zoned.getDay(),
      minutes: zoned.getHours() * 60 + zoned.getMinutes(),
    };
  }

  private static toMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  /** La fila que gobierna este instante: la de hoy, o la de ayer si su
   * rango cruza medianoche y aún no ha cerrado. null = cerrado. */
  static governingPeriod(
    hours: BusinessHour[],
    now: Date,
    timeZone: string,
  ): BusinessHour | null {
    const { dayOfWeek, minutes } = StoreSchedule.zonedNow(now, timeZone);
    const byDay = new Map(hours.map((h) => [h.dayOfWeek, h]));
    const today = byDay.get(dayOfWeek);
    const yesterday = byDay.get((dayOfWeek + 6) % 7);

    if (today && !today.isClosed) {
      const opens = StoreSchedule.toMinutes(today.opensAt);
      const closes = StoreSchedule.toMinutes(today.closesAt);
      const crosses = closes <= opens;
      if (crosses ? minutes >= opens : minutes >= opens && minutes < closes) {
        return today;
      }
    }
    if (yesterday && !yesterday.isClosed) {
      const opens = StoreSchedule.toMinutes(yesterday.opensAt);
      const closes = StoreSchedule.toMinutes(yesterday.closesAt);
      if (closes <= opens && minutes < closes) {
        return yesterday;
      }
    }
    return null;
  }

  static isOpenNow(
    hours: BusinessHour[],
    now: Date,
    timeZone: string,
  ): boolean {
    return StoreSchedule.governingPeriod(hours, now, timeZone) !== null;
  }

  /** La fila del día de hoy (para mostrar "hoy abre/cierra a las X"). */
  static today(
    hours: BusinessHour[],
    now: Date,
    timeZone: string,
  ): BusinessHour | null {
    const { dayOfWeek } = StoreSchedule.zonedNow(now, timeZone);
    return hours.find((h) => h.dayOfWeek === dayOfWeek) ?? null;
  }
}
