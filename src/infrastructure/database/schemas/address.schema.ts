import { EntitySchema } from 'typeorm';
import { Address } from '../../../modules/auth/domain/entities/address.entity';

export const AddressSchema = new EntitySchema<Address>({
  name: 'Address',
  target: Address,
  tableName: 'addresses',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    userId: { name: 'user_id', type: 'uuid' },
    label: { type: 'varchar', length: 50 },
    addressLine: { name: 'address_line', type: 'varchar', length: 255 },
    reference: { type: 'text', nullable: true },
    latitude: { type: 'numeric', precision: 9, scale: 6, nullable: true },
    longitude: { type: 'numeric', precision: 9, scale: 6, nullable: true },
    isDefault: { name: 'is_default', type: 'boolean', default: false },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
