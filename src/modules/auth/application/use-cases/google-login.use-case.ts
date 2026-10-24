import { Inject, Injectable } from '@nestjs/common';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { UserSuspendedException } from '../../domain/exceptions/user-suspended.exception';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  GOOGLE_TOKEN_VERIFIER,
  type IGoogleTokenVerifier,
} from '../../domain/services/google-token-verifier.interface';
import { ReferralCodeService } from '../services/referral-code.service';
import { IssuedSession, SessionService } from '../services/session.service';

export interface GoogleLoginCommand {
  idToken: string;
  deviceFingerprint?: string;
  platform?: string;
}

@Injectable()
export class GoogleLoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(GOOGLE_TOKEN_VERIFIER)
    private readonly googleVerifier: IGoogleTokenVerifier,
    private readonly referralCodes: ReferralCodeService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(cmd: GoogleLoginCommand): Promise<IssuedSession> {
    const profile = await this.googleVerifier.verify(cmd.idToken);
    const email = profile.email.trim().toLowerCase();

    let user =
      (await this.users.findByGoogleId(profile.googleId)) ??
      (await this.users.findByEmail(email));

    if (user) {
      if (user.status === UserStatus.SUSPENDED) {
        throw new UserSuspendedException();
      }
      let dirty = false;
      if (!user.googleId) {
        user.googleId = profile.googleId;
        dirty = true;
      }
      if (user.status === UserStatus.PENDING_VERIFICATION) {
        // Google ya probó el correo → activar directo
        user.status = UserStatus.ACTIVE;
        user.emailVerifiedAt = user.emailVerifiedAt ?? new Date();
        dirty = true;
      }
      if (dirty) user = await this.users.save(user);
    } else {
      user = new User();
      user.email = email;
      user.googleId = profile.googleId;
      user.passwordHash = null;
      user.firstName =
        profile.givenName?.trim().slice(0, 100) ||
        email.split('@')[0].slice(0, 100);
      user.lastName = profile.familyName?.trim().slice(0, 100) || null;
      user.status = UserStatus.ACTIVE;
      user.emailVerifiedAt = new Date();
      user.referralCode = await this.referralCodes.generate();
      user = await this.users.save(user);
    }

    return this.sessionService.issue(user, cmd.deviceFingerprint, cmd.platform);
  }
}
