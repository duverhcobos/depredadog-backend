export class DayHoursResponseDto {
  dayOfWeek!: number;
  /** 'HH:MM' hora local del negocio. */
  opensAt!: string;
  closesAt!: string;
  isClosed!: boolean;
}

export class StoreConfigResponseDto {
  name!: string;
  phone!: string | null;
  address!: string | null;
  logoUrl!: string | null;
  deliveryFee!: number;
  minDeliveryOrder!: number | null;
  /** Derivado de business_hours + STORE_TIMEZONE — nunca un flag manual. */
  isOpen!: boolean;
  /** La fila de hoy (para "Hoy cierra 23:00"). null si falta el día. */
  today!: DayHoursResponseDto | null;
  weeklyHours!: DayHoursResponseDto[];
}
