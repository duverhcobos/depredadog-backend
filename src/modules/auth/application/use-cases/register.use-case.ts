import { Inject, Injectable } from '@nestjs/common';
import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyRegisteredException } from '../../domain/exceptions/email-already-registered.exception';
import { InvalidReferralCodeException } from '../../domain/exceptions/invalid-referral-code.exception';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  DEVICE_REPOSITORY,
  type IDeviceRepository,
} from '../../domain/repositories/device.repository.interface';
import {
  type IPasswordHasher,
  PASSWORD_HASHER,
} from '../../domain/services/password-hasher.interface';
import { ReferralCodeService } from '../services/referral-code.service';
import { VerificationCodeService } from '../services/verification-code.service';

export interface RegisterCommand {
  email: string;
  password: string;
  firstName: string;
  secondName?: string;
  firstLastName: string;
  secondLastName?: string;
  phone?: string;
  referralCode?: string;
  marketingOptIn?: boolean;
  deviceFingerprint?: string;
  platform?: string;
  registeredIp: string | null;
}

@Injectable()
export class RegisterUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(DEVICE_REPOSITORY) private readonly devices: IDeviceRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    private readonly verificationCode: VerificationCodeService,
    private readonly referralCodes: ReferralCodeService,
  ) { }

  async execute(cmd: RegisterCommand): Promise<User> {
    const email = cmd.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) {
      throw new EmailAlreadyRegisteredException();
    }

    let referredBy: string | null = null;
    if (cmd.referralCode) {
      const referrer = await this.users.findByReferralCode(
        cmd.referralCode.trim().toUpperCase(),
      );
      if (!referrer) throw new InvalidReferralCodeException();
      referredBy = referrer.id;
    }

    const user = new User();
    user.email = email;
    user.passwordHash = await this.passwordHasher.hash(cmd.password);
    user.firstName = cmd.firstName.trim();
    // Los opcionales usan || null: '' (string solo-espacios) también debe
    // persistir NULL, no '' — ?? solo cubre undefined (revisor).
    user.secondName = cmd.secondName?.trim() || null;
    user.firstLastName = cmd.firstLastName.trim();
    user.secondLastName = cmd.secondLastName?.trim() || null;
    user.phone = cmd.phone?.trim() || null;
    user.referredBy = referredBy;
    user.marketingOptIn = cmd.marketingOptIn ?? false;
    user.registeredIp = cmd.registeredIp;
    user.referralCode = await this.referralCodes.generate();
    const saved = await this.users.save(user);

    if (cmd.deviceFingerprint) {
      await this.devices.touch(
        saved.id,
        cmd.deviceFingerprint,
        cmd.platform ?? null,
      );
    }
    await this.verificationCode.issue(saved);
    return saved;
  }
}
