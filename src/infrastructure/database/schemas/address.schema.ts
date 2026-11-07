import { EntitySchema } from 'typeorm';
import { Address } from '../../../modules/auth/domain/entities/address.entity';
import { AddressType } from '../../../modules/auth/domain/enums/address-type.enum';

// PG devuelve numeric como string — mismo transformer local de
// order.schema.ts, con guarda NULL (lat/lng son nullable).
const numeric = {
  to: (value: number) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

export const AddressSchema = new EntitySchema<Address>({
  name: 'Address',
  target: Address,
  tableName: 'addresses',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    userId: { name: 'user_id', type: 'uuid' },
    label: { type: 'varchar', length: 50 },
    landmark: { type: 'varchar', length: 255 },
    neighborhood: { type: 'text', nullable: true },
    type: {
      type: 'enum',
      enum: AddressType,
      enumName: 'address_type',
      default: AddressType.OTHER,
    },
    latitude: {
      type: 'numeric',
      precision: 9,
      scale: 6,
      nullable: true,
      transformer: numeric,
    },
    longitude: {
      type: 'numeric',
      precision: 9,
      scale: 6,
      nullable: true,
      transformer: numeric,
    },
    isDefault: { name: 'is_default', type: 'boolean', default: false },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
