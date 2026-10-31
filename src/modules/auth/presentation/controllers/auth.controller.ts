import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../../common/decorators/public.decorator';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../../../common/decorators/current-user.decorator';
import { AuthService } from '../../application/services/auth.service';
import { RegisterDto } from '../../application/dtos/register.dto';
import { VerifyEmailDto } from '../../application/dtos/verify-email.dto';
import { ResendVerificationDto } from '../../application/dtos/resend-verification.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { RefreshTokenDto } from '../../application/dtos/refresh-token.dto';
import { ForgotPasswordDto } from '../../application/dtos/forgot-password.dto';
import { ResetPasswordDto } from '../../application/dtos/reset-password.dto';
import { CheckResetCodeDto } from '../../application/dtos/check-reset-code.dto';
import { GoogleLoginDto } from '../../application/dtos/google-login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('register')
  @HttpCode(201)
  register(@Body() dto: RegisterDto, @Ip() ip: string | undefined) {
    return this.authService.register(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('resend-verification')
  @HttpCode(200)
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('check-reset-code')
  @HttpCode(200)
  checkResetCode(@Body() dto: CheckResetCodeDto) {
    return this.authService.checkResetCode(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('google')
  @HttpCode(200)
  google(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user.sessionId);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.userId, user.sessionId);
  }
}
