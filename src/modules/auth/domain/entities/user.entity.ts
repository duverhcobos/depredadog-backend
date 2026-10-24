import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';

export class User {
  id!: string;
  email!: string;
  passwordHash: string | null = null;
  googleId: string | null = null;
  role: UserRole = UserRole.CUSTOMER;
  status: UserStatus = UserStatus.PENDING_VERIFICATION;
  emailVerifiedAt: Date | null = null;
  firstName!: string;
  lastName: string | null = null;
  phone: string | null = null;
  registeredIp: string | null = null;
  referralCode!: string;
  referredBy: string | null = null;
  marketingOptIn = false;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt: Date | null = null;
}
