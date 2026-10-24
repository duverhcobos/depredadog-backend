import { EntitySchema } from 'typeorm';
import { RefreshToken } from '../../../modules/auth/domain/entities/refresh-token.entity';

export const RefreshTokenSchema = new EntitySchema<RefreshToken>({
  name: 'RefreshToken',
  target: RefreshToken,
  tableName: 'refresh_tokens',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    userId: { name: 'user_id', type: 'uuid' },
    deviceId: { name: 'device_id', type: 'uuid', nullable: true },
    tokenHash: { name: 'token_hash', type: 'varchar', length: 255 },
    expiresAt: { name: 'expires_at', type: 'timestamptz' },
    revokedAt: { name: 'revoked_at', type: 'timestamptz', nullable: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
  },
});
