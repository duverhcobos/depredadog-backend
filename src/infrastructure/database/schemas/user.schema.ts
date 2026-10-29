import { EntitySchema } from 'typeorm';
import { User } from '../../../modules/auth/domain/entities/user.entity';
import { UserRole } from '../../../modules/auth/domain/enums/user-role.enum';
import { UserStatus } from '../../../modules/auth/domain/enums/user-status.enum';

export const UserSchema = new EntitySchema<User>({
  name: 'User',
  target: User,
  tableName: 'users',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    email: { type: 'citext' },
    passwordHash: {
      name: 'password_hash',
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    googleId: {
      name: 'google_id',
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    role: {
      type: 'enum',
      enum: UserRole,
      enumName: 'user_role',
      default: UserRole.CUSTOMER,
    },
    status: {
      type: 'enum',
      enum: UserStatus,
      enumName: 'user_status',
      default: UserStatus.PENDING_VERIFICATION,
    },
    emailVerifiedAt: {
      name: 'email_verified_at',
      type: 'timestamptz',
      nullable: true,
    },
    firstName: { name: 'first_name', type: 'varchar', length: 100 },
    secondName: {
      name: 'second_name',
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    firstLastName: { name: 'first_last_name', type: 'varchar', length: 100 },
    secondLastName: {
      name: 'second_last_name',
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    phone: { type: 'varchar', length: 20, nullable: true },
    registeredIp: {
      name: 'registered_ip',
      type: 'inet',
      nullable: true,
    },
    referralCode: { name: 'referral_code', type: 'varchar', length: 20 },
    referredBy: { name: 'referred_by', type: 'uuid', nullable: true },
    marketingOptIn: {
      name: 'marketing_opt_in',
      type: 'boolean',
      default: false,
    },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
    deletedAt: {
      name: 'deleted_at',
      type: 'timestamptz',
      nullable: true,
      deleteDate: true,
    },
  },
});
