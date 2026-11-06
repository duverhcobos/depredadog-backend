import { EntitySchema } from 'typeorm';
import { BusinessHour } from '../../../modules/store/domain/entities/business-hour.entity';

export const BusinessHourSchema = new EntitySchema<BusinessHour>({
  name: 'BusinessHour',
  target: BusinessHour,
  tableName: 'business_hours',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    dayOfWeek: { name: 'day_of_week', type: 'smallint' },
    opensAt: { name: 'opens_at', type: 'time' },
    closesAt: { name: 'closes_at', type: 'time' },
    isClosed: { name: 'is_closed', type: 'boolean', default: false },
  },
});
