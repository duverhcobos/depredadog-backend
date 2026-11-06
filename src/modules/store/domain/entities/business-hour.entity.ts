export class BusinessHour {
  id!: string;
  /** 0=domingo … 6=sábado (convención JS getDay / PG extract(dow)). */
  dayOfWeek!: number;
  /** 'HH:MM:SS' — hora local del negocio (time de PG llega como string). */
  opensAt!: string;
  closesAt!: string;
  isClosed = false;
}
