import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressSchema } from '../../infrastructure/database/schemas/address.schema';
import { AuthTokenSchema } from '../../infrastructure/database/schemas/auth-token.schema';
import { DeviceSchema } from '../../infrastructure/database/schemas/device.schema';
import { RefreshTokenSchema } from '../../infrastructure/database/schemas/refresh-token.schema';
import { UserSchema } from '../../infrastructure/database/schemas/user.schema';
import { LoggerModule } from '../../common/logger/logger.module';
import { AuthController } from './presentation/controllers/auth.controller';
import { AddressesController } from './presentation/controllers/addresses.controller';
import { AddressesService } from './application/services/addresses.service';
import { AddressMapper } from './application/mappers/address.mapper';
import { ListAddressesUseCase } from './application/use-cases/list-addresses.use-case';
import { CreateAddressUseCase } from './application/use-cases/create-address.use-case';
import { UpdateAddressUseCase } from './application/use-cases/update-address.use-case';
import { DeleteAddressUseCase } from './application/use-cases/delete-address.use-case';
import { ADDRESS_REPOSITORY } from './domain/repositories/address.repository.interface';
import { AddressRepository } from './infrastructure/repositories/address.repository';
import { AuthMapper } from './application/mappers/auth.mapper';
import { AuthService } from './application/services/auth.service';
import { SessionService } from './application/services/session.service';
import { VerificationCodeService } from './application/services/verification-code.service';
import { ForgotPasswordUseCase } from './application/use-cases/forgot-password.use-case';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { GoogleLoginUseCase } from './application/use-cases/google-login.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RefreshUseCase } from './application/use-cases/refresh.use-case';
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { ResendVerificationUseCase } from './application/use-cases/resend-verification.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { CheckResetCodeUseCase } from './application/use-cases/check-reset-code.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
import { ReferralCodeService } from './application/services/referral-code.service';
import { AUTH_TOKEN_REPOSITORY } from './domain/repositories/auth-token.repository.interface';
import { DEVICE_REPOSITORY } from './domain/repositories/device.repository.interface';
import { REFRESH_TOKEN_REPOSITORY } from './domain/repositories/refresh-token.repository.interface';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { CODE_GENERATOR } from './domain/services/code-generator.interface';
import { EMAIL_SENDER } from './domain/services/email-sender.interface';
import { GOOGLE_TOKEN_VERIFIER } from './domain/services/google-token-verifier.interface';
import { PASSWORD_HASHER } from './domain/services/password-hasher.interface';
import { AuthTokenRepository } from './infrastructure/repositories/auth-token.repository';
import { DeviceRepository } from './infrastructure/repositories/device.repository';
import { RefreshTokenRepository } from './infrastructure/repositories/refresh-token.repository';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { CodeGeneratorService } from './infrastructure/services/code-generator.service';
import { EmailSenderService } from './infrastructure/services/email-sender.service';
import { GoogleTokenVerifierService } from './infrastructure/services/google-token-verifier.service';
import { PasswordHasherService } from './infrastructure/services/password-hasher.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserSchema,
      AddressSchema,
      DeviceSchema,
      AuthTokenSchema,
      RefreshTokenSchema,
    ]),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('auth.jwtSecret')!,
        signOptions: {
          expiresIn: config.get<StringValue>('auth.accessTokenTtl')!,
        },
      }),
    }),
    LoggerModule,
  ],
  controllers: [AuthController, AddressesController],
  providers: [
    AuthService,
    AuthMapper,
    SessionService,
    VerificationCodeService,
    ReferralCodeService,
    RegisterUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    CheckResetCodeUseCase,
    GoogleLoginUseCase,
    VerifyEmailUseCase,
    ResendVerificationUseCase,
    LoginUseCase,
    RefreshUseCase,
    LogoutUseCase,
    GetMeUseCase,
    { provide: USER_REPOSITORY, useClass: UserRepository },
    { provide: DEVICE_REPOSITORY, useClass: DeviceRepository },
    { provide: AUTH_TOKEN_REPOSITORY, useClass: AuthTokenRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: RefreshTokenRepository },
    { provide: PASSWORD_HASHER, useClass: PasswordHasherService },
    { provide: CODE_GENERATOR, useClass: CodeGeneratorService },
    { provide: EMAIL_SENDER, useClass: EmailSenderService },
    { provide: GOOGLE_TOKEN_VERIFIER, useClass: GoogleTokenVerifierService },
    AddressesService,
    AddressMapper,
    ListAddressesUseCase,
    CreateAddressUseCase,
    UpdateAddressUseCase,
    DeleteAddressUseCase,
    { provide: ADDRESS_REPOSITORY, useClass: AddressRepository },
    JwtStrategy,
  ],
  exports: [ADDRESS_REPOSITORY, USER_REPOSITORY],
})
export class AuthModule { }
