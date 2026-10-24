import { AuthToken } from '../entities/auth-token.entity';
import { AuthTokenType } from '../enums/auth-token-type.enum';

export interface IAuthTokenRepository {
  save(token: AuthToken): Promise<AuthToken>;
  findValidByHash(
    tokenHash: string,
    type: AuthTokenType,
  ): Promise<AuthToken | null>;
  consume(id: string): Promise<boolean>;
  consumePendingForUser(userId: string, type: AuthTokenType): Promise<void>;
}

export const AUTH_TOKEN_REPOSITORY = Symbol('IAuthTokenRepository');
