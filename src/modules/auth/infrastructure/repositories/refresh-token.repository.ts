import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { IRefreshTokenRepository } from '../../domain/repositories/refresh-token.repository.interface';

@Injectable()
export class RefreshTokenRepository implements IRefreshTokenRepository {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly orm: Repository<RefreshToken>,
  ) {}

  save(token: RefreshToken): Promise<RefreshToken> {
    return this.orm.save(token);
  }

  findById(id: string): Promise<RefreshToken | null> {
    return this.orm.findOne({ where: { id } });
  }

  findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.orm.findOne({ where: { tokenHash } });
  }

  async revoke(id: string): Promise<boolean> {
    const result = await this.orm.update(
      { id, revokedAt: IsNull() },
      {
        revokedAt: new Date(),
      },
    );
    return (result.affected ?? 0) > 0;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.orm.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
