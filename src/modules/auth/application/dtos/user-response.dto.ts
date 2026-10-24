export class UserResponseDto {
  id!: string;
  email!: string;
  firstName!: string;
  lastName!: string | null;
  phone!: string | null;
  role!: string;
  status!: string;
  emailVerifiedAt!: string | null;
  referralCode!: string;
  marketingOptIn!: boolean;
  createdAt!: string;
}
