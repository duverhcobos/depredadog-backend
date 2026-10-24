import { Inject, Injectable } from '@nestjs/common';
import { UserStatus } from '../../domain/enums/user-status.enum';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { VerificationCodeService } from '../services/verification-code.service';

export interface ForgotPasswordCommand {
  email: string;
}

@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly verificationCode: VerificationCodeService,
  ) {}

  async execute(cmd: ForgotPasswordCommand): Promise<void> {
    const user = await this.users.findByEmail(cmd.email.trim().toLowerCase());
    // Anti-enumeración: silencio total si no existe o está suspendido.
    // Usuarios solo-Google (sin passwordHash) SÍ reciben código — el reset
    // les crea una contraseña acreditada por posesión del email.
    if (!user || user.status === UserStatus.SUSPENDED) return;
    await this.verificationCode.issuePasswordReset(user);
  }
}
