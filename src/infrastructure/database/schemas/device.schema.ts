import { EntitySchema } from 'typeorm';
import { Device } from '../../../modules/auth/domain/entities/device.entity';

export const DeviceSchema = new EntitySchema<Device>({
  name: 'Device',
  target: Device,
  tableName: 'devices',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    userId: { name: 'user_id', type: 'uuid' },
    fingerprint: { type: 'varchar', length: 255 },
    platform: { type: 'varchar', length: 20, nullable: true },
    pushToken: {
      name: 'push_token',
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    notificationsEnabled: {
      name: 'notifications_enabled',
      type: 'boolean',
      default: true,
    },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    lastSeenAt: { name: 'last_seen_at', type: 'timestamptz' },
  },
});
