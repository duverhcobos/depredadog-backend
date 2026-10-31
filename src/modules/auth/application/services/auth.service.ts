import { Injectable } from '@nestjs/common';
import { AuthMapper } from '../mappers/auth.mapper';
import { ForgotPasswordUseCase } from '../use-cases/forgot-password.use-case';
import { GetMeUseCase } from '../use-cases/get-me.use-case';
import { GoogleLoginUseCase } from '../use-cases/google-login.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { LogoutUseCase } from '../use-cases/logout.use-case';
import { RefreshUseCase } from '../use-cases/refresh.use-case';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { ResendVerificationUseCase } from '../use-cases/resend-verification.use-case';
import { ResetPasswordUseCase } from '../use-cases/reset-password.use-case';
import { CheckResetCodeUseCase } from '../use-cases/check-reset-code.use-case';
import { VerifyEmailUseCase } from '../use-cases/verify-email.use-case';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { ForgotPasswordDto } from '../dtos/forgot-password.dto';
import { GoogleLoginDto } from '../dtos/google-login.dto';
import { LoginDto } from '../dtos/login.dto';
import { MessageResponseDto } from '../dtos/message-response.dto';
import { RefreshTokenDto } from '../dtos/refresh-token.dto';
import { RegisterDto } from '../dtos/register.dto';
import { ResendVerificationDto } from '../dtos/resend-verification.dto';
import { ResetPasswordDto } from '../dtos/reset-password.dto';
import { CheckResetCodeDto } from '../dtos/check-reset-code.dto';
import { TokensResponseDto } from '../dtos/tokens-response.dto';
import { UserResponseDto } from '../dtos/user-response.dto';
import { VerifyEmailDto } from '../dtos/verify-email.dto';

const GENERIC_RESEND_MESSAGE =
  'If that email is registered and unverified, a new code has been sent.';
const GENERIC_FORGOT_MESSAGE =
  'If that email is registered, a reset code has been sent.';
const GENERIC_CODE_OK_MESSAGE = 'Reset code is valid.';

@Injectable()
export class AuthService {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    private readonly resendVerificationUseCase: ResendVerificationUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly checkResetCodeUseCase: CheckResetCodeUseCase,
    private readonly googleLoginUseCase: GoogleLoginUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getMeUseCase: GetMeUseCase,
    private readonly authMapper: AuthMapper,
  ) {}

  async register(dto: RegisterDto, ip?: string): Promise<UserResponseDto> {
    const user = await this.registerUseCase.execute({
      ...dto,
      registeredIp: ip ?? null,
    });
    return this.authMapper.toUserResponse(user);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResponseDto> {
    const { user, accessToken, refreshToken } =
      await this.verifyEmailUseCase.execute({
        email: dto.email,
        code: dto.code,
        deviceFingerprint: dto.deviceFingerprint,
        platform: dto.platform,
      });
    return this.authMapper.toAuthResponse(user, { accessToken, refreshToken });
  }

  async resendVerification(
    dto: ResendVerificationDto,
  ): Promise<MessageResponseDto> {
    await this.resendVerificationUseCase.execute({ email: dto.email });
    const response = new MessageResponseDto();
    response.message = GENERIC_RESEND_MESSAGE;
    return response;
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const { user, accessToken, refreshToken } = await this.loginUseCase.execute(
      {
        email: dto.email,
        password: dto.password,
        deviceFingerprint: dto.deviceFingerprint,
        platform: dto.platform,
      },
    );
    return this.authMapper.toAuthResponse(user, { accessToken, refreshToken });
  }

  async refresh(dto: RefreshTokenDto): Promise<TokensResponseDto> {
    const tokens = await this.refreshUseCase.execute({
      refreshToken: dto.refreshToken,
    });
    const response = new TokensResponseDto();
    response.accessToken = tokens.accessToken;
    response.refreshToken = tokens.refreshToken;
    return response;
  }

  async logout(sessionId: string): Promise<void> {
    await this.logoutUseCase.execute({ sessionId });
  }

  async me(userId: string, sessionId: string): Promise<UserResponseDto> {
    const user = await this.getMeUseCase.execute({ userId, sessionId });
    return this.authMapper.toUserResponse(user);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    await this.forgotPasswordUseCase.execute({ email: dto.email });
    const response = new MessageResponseDto();
    response.message = GENERIC_FORGOT_MESSAGE;
    return response;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<AuthResponseDto> {
    const { user, accessToken, refreshToken } =
      await this.resetPasswordUseCase.execute({
        email: dto.email,
        code: dto.code,
        newPassword: dto.newPassword,
        deviceFingerprint: dto.deviceFingerprint,
        platform: dto.platform,
      });
    return this.authMapper.toAuthResponse(user, { accessToken, refreshToken });
  }

  async checkResetCode(dto: CheckResetCodeDto): Promise<MessageResponseDto> {
    await this.checkResetCodeUseCase.execute({
      email: dto.email,
      code: dto.code,
    });
    const response = new MessageResponseDto();
    response.message = GENERIC_CODE_OK_MESSAGE;
    return response;
  }

  async googleLogin(dto: GoogleLoginDto): Promise<AuthResponseDto> {
    const { user, accessToken, refreshToken } =
      await this.googleLoginUseCase.execute({
        idToken: dto.idToken,
        deviceFingerprint: dto.deviceFingerprint,
        platform: dto.platform,
      });
    return this.authMapper.toAuthResponse(user, { accessToken, refreshToken });
  }
}
