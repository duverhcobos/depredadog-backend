export class RefreshToken {
  id!: string;
  userId!: string;
  deviceId: string | null = null;
  tokenHash!: string;
  expiresAt!: Date;
  revokedAt: Date | null = null;
  createdAt!: Date;
}
