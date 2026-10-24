import { AuthTokenType } from '../enums/auth-token-type.enum';

export class AuthToken {
  id!: string;
  userId!: string;
  tokenHash!: string;
  type!: AuthTokenType;
  expiresAt!: Date;
  consumedAt: Date | null = null;
  createdAt!: Date;
}
