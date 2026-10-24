import { Inject, Injectable } from '@nestjs/common';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { SessionNotFoundException } from '../../domain/exceptions/session-not-found.exception';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';

export interface GetMeCommand {
  userId: string;
  sessionId: string;
}

@Injectable()
export class GetMeUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: IRefreshTokenRepository,
  ) {}

  async execute(cmd: GetMeCommand): Promise<User> {
    const [user, session] = await Promise.all([
      this.users.findById(cmd.userId),
      this.refreshTokens.findById(cmd.sessionId),
    ]);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new SessionNotFoundException();
    }
    if (
      !session ||
      session.userId !== user.id ||
      session.revokedAt ||
      session.expiresAt.getTime() < Date.now()
    ) {
      throw new SessionNotFoundException();
    }
    return user;
  }
}
