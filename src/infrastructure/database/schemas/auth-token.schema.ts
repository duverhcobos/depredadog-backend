import { EntitySchema } from 'typeorm';
import { AuthToken } from '../../../modules/auth/domain/entities/auth-token.entity';
import { AuthTokenType } from '../../../modules/auth/domain/enums/auth-token-type.enum';

export const AuthTokenSchema = new EntitySchema<AuthToken>({
  name: 'AuthToken',
  target: AuthToken,
  tableName: 'auth_tokens',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    userId: { name: 'user_id', type: 'uuid' },
    tokenHash: { name: 'token_hash', type: 'varchar', length: 255 },
    type: { type: 'enum', enum: AuthTokenType, enumName: 'auth_token_type' },
    expiresAt: { name: 'expires_at', type: 'timestamptz' },
    consumedAt: { name: 'consumed_at', type: 'timestamptz', nullable: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
  },
});
