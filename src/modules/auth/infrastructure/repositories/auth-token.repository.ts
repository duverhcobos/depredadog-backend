import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuthToken } from '../../domain/entities/auth-token.entity';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import { IAuthTokenRepository } from '../../domain/repositories/auth-token.repository.interface';

@Injectable()
export class AuthTokenRepository implements IAuthTokenRepository {
  constructor(
    @InjectRepository(AuthToken) private readonly orm: Repository<AuthToken>,
  ) {}

  save(token: AuthToken): Promise<AuthToken> {
    return this.orm.save(token);
  }

  findValidByHash(
    tokenHash: string,
    type: AuthTokenType,
  ): Promise<AuthToken | null> {
    return this.orm.findOne({
      where: { tokenHash, type, consumedAt: IsNull() },
    });
  }

  async consume(id: string): Promise<boolean> {
    const result = await this.orm.update(
      { id, consumedAt: IsNull() },
      {
        consumedAt: new Date(),
      },
    );
    return (result.affected ?? 0) > 0;
  }

  async consumePendingForUser(
    userId: string,
    type: AuthTokenType,
  ): Promise<void> {
    await this.orm.update(
      { userId, type, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
  }
}
