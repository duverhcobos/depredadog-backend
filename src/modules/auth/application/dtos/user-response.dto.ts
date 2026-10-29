export class UserResponseDto {
  id!: string;
  email!: string;
  firstName!: string;
  secondName!: string | null;
  firstLastName!: string;
  secondLastName!: string | null;
  phone!: string | null;
  role!: string;
  status!: string;
  emailVerifiedAt!: string | null;
  referralCode!: string;
  marketingOptIn!: boolean;
  createdAt!: string;
}
