import { RefreshToken } from '../entities/refresh-token.entity';

export interface IRefreshTokenRepository {
  save(token: RefreshToken): Promise<RefreshToken>;
  findById(id: string): Promise<RefreshToken | null>;
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  revoke(id: string): Promise<boolean>;
  revokeAllForUser(userId: string): Promise<void>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('IRefreshTokenRepository');
