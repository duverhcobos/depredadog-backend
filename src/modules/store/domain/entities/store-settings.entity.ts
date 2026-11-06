// Una sola fila — configuración global del negocio (single-tenant).
export class StoreSettings {
  id!: string;
  name!: string;
  phone: string | null = null;
  address: string | null = null;
  logoUrl: string | null = null;
  deliveryFee = 0;
  minDeliveryOrder: number | null = null;
  createdAt!: Date;
  updatedAt!: Date;
}
