import { EntitySchema } from 'typeorm';
import { StoreSettings } from '../../../modules/store/domain/entities/store-settings.entity';

const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const StoreSettingsSchema = new EntitySchema<StoreSettings>({
  name: 'StoreSettings',
  target: StoreSettings,
  tableName: 'store_settings',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    name: { type: 'varchar', length: 150 },
    phone: { type: 'varchar', length: 20, nullable: true },
    address: { type: 'varchar', length: 255, nullable: true },
    logoUrl: { name: 'logo_url', type: 'varchar', length: 500, nullable: true },
    deliveryFee: {
      name: 'delivery_fee',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
      default: 0,
    },
    minDeliveryOrder: {
      name: 'min_delivery_order',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
      nullable: true,
    },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
