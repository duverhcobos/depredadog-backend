import { Inject, Injectable } from '@nestjs/common';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';

export interface LogoutCommand {
  sessionId: string;
}

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: IRefreshTokenRepository,
  ) {}

  async execute(cmd: LogoutCommand): Promise<void> {
    await this.refreshTokens.revoke(cmd.sessionId);
  }
}
