# Propuesta: Módulo `auth` (parte 2) — recuperación de contraseña y Google Sign-In

Segunda y última pieza del módulo `auth`. Cierra el ciclo de credenciales:
`POST /auth/forgot-password`, `POST /auth/reset-password` y `POST /auth/google`
(login/registro con `idToken` de Google). Todo sobre la base de 002 — **sin
migración nueva**: `auth_tokens.type = 'password_reset'` y `users.google_id` ya
existen, `IEmailSender.sendPasswordResetCode` ya está implementado, y
`GOOGLE_CLIENT_IDS` ya está en config/env.

Dependencias nuevas: `google-auth-library` (verificación de `idToken` contra los
JWKS de Google — estándar oficial).

## Decisiones de diseño (ya validadas)

1. **Reset code = mismo formato de 6 dígitos** que verificación (sha256 en
   `auth_tokens.token_hash`, TTL `auth.codeTtlMinutes`).
2. **`reset-password` devuelve sesión** (access + refresh) — consistente con
   `verify-email`; además **revoca todas las demás sesiones** del usuario
   (`revokeAllForUser`) como medida de seguridad post-cambio de credencial.
3. **`forgot-password` anti-enumeración**: siempre 200 con mensaje genérico;
   emite código solo si el usuario existe y NO está `suspended`. Usuarios
   "solo-Google" (sin `password_hash`) sí reciben código — resetear les crea
   una contraseña (acreditado por posesión del email).
4. **Google**: exige `email_verified=true` en el payload del `idToken` (si no,
   401 — evita vincular cuentas con emails no probados por Google). Vincula
   `google_id` si el email ya existe; crea usuario `active` directo si es nuevo.
   Usuario `suspended` → `UserSuspendedException`. Usuario `pending_verification`
   con email probado por Google → queda `active` (Google ya verificó el correo).
5. **Extracción**: la generación de `referral_code` con reintentos sale de
   `RegisterUseCase` a un `ReferralCodeService` compartido (Google también lo
   necesita — `users.referral_code` es NOT NULL UNIQUE).
6. Throttling: `forgot-password` 3/min, `reset-password` 5/min, `google` 5/min.
7. E2E: el verificador de Google se espía como `EmailSenderService` — ningún
   test golpea los servidores de Google.

## Desviaciones del modelo de datos

Ninguna — usa exactamente las columnas/enums de la migración de 002.

## Resumen de cambios

| Archivo | Acción |
|---|---|
| `src/modules/auth/application/dtos/forgot-password.dto.ts` | **Nuevo** |
| `src/modules/auth/application/dtos/reset-password.dto.ts` | **Nuevo** |
| `src/modules/auth/application/dtos/google-login.dto.ts` | **Nuevo** |
| `src/modules/auth/domain/services/google-token-verifier.interface.ts` | **Nuevo** — port + `GoogleProfile` + `GOOGLE_TOKEN_VERIFIER` |
| `src/modules/auth/domain/exceptions/invalid-google-token.exception.ts` | **Nuevo** — 401 |
| `src/modules/auth/application/services/referral-code.service.ts` | **Nuevo** — extraído de `RegisterUseCase` |
| `src/modules/auth/application/use-cases/forgot-password.use-case.ts` | **Nuevo** |
| `src/modules/auth/application/use-cases/reset-password.use-case.ts` | **Nuevo** |
| `src/modules/auth/application/use-cases/google-login.use-case.ts` | **Nuevo** |
| `src/modules/auth/infrastructure/services/google-token-verifier.service.ts` | **Nuevo** — `OAuth2Client` de google-auth-library |
| `src/modules/auth/application/services/verification-code.service.ts` | Actualizar — `issuePasswordReset` (refactor a `issueToken` privado) |
| `src/modules/auth/application/services/auth.service.ts` | Actualizar — 3 métodos nuevos |
| `src/modules/auth/application/use-cases/register.use-case.ts` | Actualizar — usa `ReferralCodeService` |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | Actualizar — 3 rutas |
| `src/modules/auth/auth.module.ts` | Actualizar — providers nuevos |
| `test/support/e2e-app.ts` | Actualizar — spy del verificador de Google + helper |
| `package.json` | +`google-auth-library` |
| `**/*.spec.ts` | 5 specs unitarios nuevos + 2 actualizados |
| `test/auth/*.e2e-spec.ts` | 3 specs e2e nuevos |
| `documentacion/api/auth/008-010*.md` + `documentacion/api/README.md` | Docs de los 3 endpoints |

## 1. `auth.controller.ts` — stub (archivo existente — actualización)

Agregar imports y tres métodos que delegan en `AuthService` (aún sin métodos —
no compila hasta el paso 6):

```typescript
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
  @Post('google')
  @HttpCode(200)
  google(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto);
  }
```

## 2. `auth.service.ts` — stub (archivo existente — actualización)

Stubs que lanzan `NotImplementedException` (se completan en el paso 8):

```typescript
  forgotPassword(dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    void dto;
    throw new NotImplementedException();
  }

  resetPassword(dto: ResetPasswordDto): Promise<AuthResponseDto> {
    void dto;
    throw new NotImplementedException();
  }

  googleLogin(dto: GoogleLoginDto): Promise<AuthResponseDto> {
    void dto;
    throw new NotImplementedException();
  }
```

## 3. DTOs (archivos nuevos)

**Ruta:** `src/modules/auth/application/dtos/forgot-password.dto.ts`

```typescript
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}
```

**Ruta:** `src/modules/auth/application/dtos/reset-password.dto.ts`

```typescript
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceFingerprint?: string;

  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: string;
}
```

**Ruta:** `src/modules/auth/application/dtos/google-login.dto.ts`

```typescript
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  idToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceFingerprint?: string;

  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: string;
}
```

## 4. `google-token-verifier.interface.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/services/google-token-verifier.interface.ts`

```typescript
export interface GoogleProfile {
  googleId: string;
  email: string;
  givenName: string | null;
  familyName: string | null;
}

export interface IGoogleTokenVerifier {
  verify(idToken: string): Promise<GoogleProfile>;
}

export const GOOGLE_TOKEN_VERIFIER = Symbol('IGoogleTokenVerifier');
```

## 5. `invalid-google-token.exception.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/exceptions/invalid-google-token.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidGoogleTokenException extends DomainException {
  constructor() {
    super('Invalid Google token', 401);
  }
}
```

## 6. `auth.controller.ts` y `auth.service.ts` — completos

El controller queda como el stub de la sección 1 (los 3 métodos + imports de los
DTOs). En `auth.service.ts` reemplazar los stubs de la sección 2 por:

```typescript
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

  async googleLogin(dto: GoogleLoginDto): Promise<AuthResponseDto> {
    const { user, accessToken, refreshToken } =
      await this.googleLoginUseCase.execute({
        idToken: dto.idToken,
        deviceFingerprint: dto.deviceFingerprint,
        platform: dto.platform,
      });
    return this.authMapper.toAuthResponse(user, { accessToken, refreshToken });
  }
```

Constante nueva junto a `GENERIC_RESEND_MESSAGE`:

```typescript
const GENERIC_FORGOT_MESSAGE =
  'If that email is registered, a reset code has been sent.';
```

E inyección de los 3 use-cases en el constructor del service (ver sección 14).

## 7. `referral-code.service.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/services/referral-code.service.ts`

Lógica extraída de `RegisterUseCase.generateUniqueReferralCode` — ahora la usan
registro y Google login.

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ReferralCodeGenerationException } from '../../domain/exceptions/referral-code-generation.exception';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  CODE_GENERATOR,
  type ICodeGenerator,
} from '../../domain/services/code-generator.interface';

@Injectable()
export class ReferralCodeService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(CODE_GENERATOR)
    private readonly codeGenerator: ICodeGenerator,
  ) {}

  async generate(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = this.codeGenerator.generateReferralCode();
      if (!(await this.users.findByReferralCode(code))) return code;
    }
    throw new ReferralCodeGenerationException();
  }
}
```

## 8. Use-cases (archivos nuevos)

**Ruta:** `src/modules/auth/application/use-cases/forgot-password.use-case.ts`

```typescript
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
```

**Ruta:** `src/modules/auth/application/use-cases/reset-password.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { InvalidAuthCodeException } from '../../domain/exceptions/invalid-auth-code.exception';
import {
  AUTH_TOKEN_REPOSITORY,
  type IAuthTokenRepository,
} from '../../domain/repositories/auth-token.repository.interface';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  CODE_GENERATOR,
  type ICodeGenerator,
} from '../../domain/services/code-generator.interface';
import {
  type IPasswordHasher,
  PASSWORD_HASHER,
} from '../../domain/services/password-hasher.interface';
import { IssuedSession, SessionService } from '../services/session.service';

export interface ResetPasswordCommand {
  email: string;
  code: string;
  newPassword: string;
  deviceFingerprint?: string;
  platform?: string;
}

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(AUTH_TOKEN_REPOSITORY)
    private readonly authTokens: IAuthTokenRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: IRefreshTokenRepository,
    @Inject(CODE_GENERATOR)
    private readonly codeGenerator: ICodeGenerator,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    private readonly sessionService: SessionService,
  ) {}

  async execute(cmd: ResetPasswordCommand): Promise<IssuedSession> {
    const user = await this.users.findByEmail(cmd.email.trim().toLowerCase());
    const token = user
      ? await this.authTokens.findValidByHash(
          this.codeGenerator.hashToken(cmd.code),
          AuthTokenType.PASSWORD_RESET,
        )
      : null;
    // Mismo 400 genérico para todos los fallos — no revelar qué falló
    if (
      !user ||
      user.status === UserStatus.SUSPENDED ||
      !token ||
      token.userId !== user.id ||
      token.expiresAt.getTime() < Date.now()
    ) {
      throw new InvalidAuthCodeException();
    }
    const consumed = await this.authTokens.consume(token.id);
    if (!consumed) throw new InvalidAuthCodeException();

    user.passwordHash = await this.passwordHasher.hash(cmd.newPassword);
    const saved = await this.users.save(user);
    // Seguridad post-cambio de credencial: todas las sesiones previas mueren
    await this.refreshTokens.revokeAllForUser(user.id);
    return this.sessionService.issue(
      saved,
      cmd.deviceFingerprint,
      cmd.platform,
    );
  }
}
```

**Ruta:** `src/modules/auth/application/use-cases/google-login.use-case.ts`

```typescript
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
        profile.givenName?.trim() || email.split('@')[0].slice(0, 100);
      user.lastName = profile.familyName?.trim() || null;
      user.status = UserStatus.ACTIVE;
      user.emailVerifiedAt = new Date();
      user.referralCode = await this.referralCodes.generate();
      user = await this.users.save(user);
    }

    return this.sessionService.issue(
      user,
      cmd.deviceFingerprint,
      cmd.platform,
    );
  }
}
```

## 9. `verification-code.service.ts` (archivo existente — actualización)

Refactor: un `issueToken` privado parametrizado por tipo y función de envío;
`issue` (verificación) queda igual de contrato y se agrega `issuePasswordReset`.

**Antes:**

```typescript
  async issue(user: User): Promise<void> {
    const code = this.codeGenerator.generateVerificationCode();
    const token = new AuthToken();
    token.userId = user.id;
    token.type = AuthTokenType.EMAIL_VERIFICATION;
    token.tokenHash = this.codeGenerator.hashToken(code);
    token.expiresAt = new Date(
      Date.now() + this.config.get<number>('auth.codeTtlMinutes')! * 60_000,
    );
    await this.authTokens.consumePendingForUser(
      user.id,
      AuthTokenType.EMAIL_VERIFICATION,
    );
    await this.authTokens.save(token);
    // El envío es best-effort: el token queda persistido y el usuario puede
    // re-pedir el código por resend — no propagamos el fallo (además un 500
    // aquí revelaría que el email existe, rompiendo la anti-enumeración)
    try {
      await this.emailSender.sendVerificationCode(user.email, code);
    } catch (error) {
      this.logger.error(
        `Failed to send verification code to ${user.email}: ${(error as Error).message}`,
        undefined,
        'VerificationCodeService',
      );
    }
  }
```

**Después:**

```typescript
  issue(user: User): Promise<void> {
    return this.issueToken(
      user,
      AuthTokenType.EMAIL_VERIFICATION,
      (code) => this.emailSender.sendVerificationCode(user.email, code),
      'verification',
    );
  }

  issuePasswordReset(user: User): Promise<void> {
    return this.issueToken(
      user,
      AuthTokenType.PASSWORD_RESET,
      (code) => this.emailSender.sendPasswordResetCode(user.email, code),
      'password reset',
    );
  }

  private async issueToken(
    user: User,
    type: AuthTokenType,
    send: (code: string) => Promise<void>,
    kind: string,
  ): Promise<void> {
    const code = this.codeGenerator.generateVerificationCode();
    const token = new AuthToken();
    token.userId = user.id;
    token.type = type;
    token.tokenHash = this.codeGenerator.hashToken(code);
    token.expiresAt = new Date(
      Date.now() + this.config.get<number>('auth.codeTtlMinutes')! * 60_000,
    );
    await this.authTokens.consumePendingForUser(user.id, type);
    await this.authTokens.save(token);
    // El envío es best-effort: el token queda persistido y el usuario puede
    // re-pedir el código — no propagamos el fallo (además un 500 aquí
    // revelaría que el email existe, rompiendo la anti-enumeración)
    try {
      await send(code);
    } catch (error) {
      this.logger.error(
        `Failed to send ${kind} code to ${user.email}: ${(error as Error).message}`,
        undefined,
        'VerificationCodeService',
      );
    }
  }
```

## 10. `google-token-verifier.service.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/services/google-token-verifier.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { InvalidGoogleTokenException } from '../../domain/exceptions/invalid-google-token.exception';
import {
  GoogleProfile,
  IGoogleTokenVerifier,
} from '../../domain/services/google-token-verifier.interface';

@Injectable()
export class GoogleTokenVerifierService implements IGoogleTokenVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService) {}

  async verify(idToken: string): Promise<GoogleProfile> {
    const audiences = this.config.get<string[]>('auth.googleClientIds')!;
    // Sin client IDs configurados el endpoint no está disponible
    if (audiences.length === 0) throw new InvalidGoogleTokenException();
    const ticket = await this.client
      .verifyIdToken({ idToken, audience: audiences })
      .catch(() => {
        throw new InvalidGoogleTokenException();
      });
    const payload = ticket.getPayload();
    // Exigimos sub + email + email_verified=true (regla de seguridad del diseño)
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new InvalidGoogleTokenException();
    }
    return {
      googleId: payload.sub,
      email: payload.email,
      givenName: payload.given_name ?? null,
      familyName: payload.family_name ?? null,
    };
  }
}
```

## 11. `register.use-case.ts` (archivo existente — actualización)

Reemplazar la generación propia por `ReferralCodeService`.

**Antes (imports):**

```typescript
import { ReferralCodeGenerationException } from '../../domain/exceptions/referral-code-generation.exception';
```

**Después:** eliminar ese import y agregar:

```typescript
import { ReferralCodeService } from '../services/referral-code.service';
```

**Antes (constructor):**

```typescript
    private readonly verificationCode: VerificationCodeService,
```

**Después:**

```typescript
    private readonly verificationCode: VerificationCodeService,
    private readonly referralCodes: ReferralCodeService,
```

**Antes:**

```typescript
    user.referralCode = await this.generateUniqueReferralCode();
```

**Después:**

```typescript
    user.referralCode = await this.referralCodes.generate();
```

**Antes (método privado — eliminar completo):**

```typescript
  private async generateUniqueReferralCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = this.codeGenerator.generateReferralCode();
      if (!(await this.users.findByReferralCode(code))) return code;
    }
    throw new ReferralCodeGenerationException();
  }
```

**Después:** el método desaparece.

## 12. `auth.module.ts` (archivo existente — actualización)

**Antes (imports):**

```typescript
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RefreshUseCase } from './application/use-cases/refresh.use-case';
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { ResendVerificationUseCase } from './application/use-cases/resend-verification.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
```

**Después:**

```typescript
import { ForgotPasswordUseCase } from './application/use-cases/forgot-password.use-case';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { GoogleLoginUseCase } from './application/use-cases/google-login.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RefreshUseCase } from './application/use-cases/refresh.use-case';
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { ResendVerificationUseCase } from './application/use-cases/resend-verification.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
import { ReferralCodeService } from './application/services/referral-code.service';
```

Y en los imports de dominio/infra agregar:

```typescript
import { GOOGLE_TOKEN_VERIFIER } from './domain/services/google-token-verifier.interface';
import { GoogleTokenVerifierService } from './infrastructure/services/google-token-verifier.service';
```

**Antes (providers):**

```typescript
    SessionService,
    VerificationCodeService,
    RegisterUseCase,
```

**Después:**

```typescript
    SessionService,
    VerificationCodeService,
    ReferralCodeService,
    RegisterUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    GoogleLoginUseCase,
```

**Antes:**

```typescript
    { provide: EMAIL_SENDER, useClass: EmailSenderService },
    JwtStrategy,
```

**Después:**

```typescript
    { provide: EMAIL_SENDER, useClass: EmailSenderService },
    { provide: GOOGLE_TOKEN_VERIFIER, useClass: GoogleTokenVerifierService },
    JwtStrategy,
```

## 13. `auth.service.ts` — inyección de los use-cases

**Antes (imports):**

```typescript
import { RefreshUseCase } from '../use-cases/refresh.use-case';
```

**Después:**

```typescript
import { ForgotPasswordUseCase } from '../use-cases/forgot-password.use-case';
import { GoogleLoginUseCase } from '../use-cases/google-login.use-case';
import { RefreshUseCase } from '../use-cases/refresh.use-case';
import { ResetPasswordUseCase } from '../use-cases/reset-password.use-case';
```

Más los imports de `ForgotPasswordDto`, `ResetPasswordDto` y `GoogleLoginDto`.

**Antes (constructor):**

```typescript
    private readonly refreshUseCase: RefreshUseCase,
```

**Después:**

```typescript
    private readonly refreshUseCase: RefreshUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly googleLoginUseCase: GoogleLoginUseCase,
```

## 14. `package.json` — dependencia nueva

```bash
npm install google-auth-library
```

(Pin normal vía package.json — versión estable >7 días.)

## 15. `test/support/e2e-app.ts` (archivo existente — actualización)

Espía el verificador de Google igual que el sender de email — ningún e2e golpea
los servidores de Google.

**Antes:**

```typescript
import { EmailSenderService } from '../../src/modules/auth/infrastructure/services/email-sender.service';
```

**Después:**

```typescript
import { EmailSenderService } from '../../src/modules/auth/infrastructure/services/email-sender.service';
import { GoogleTokenVerifierService } from '../../src/modules/auth/infrastructure/services/google-token-verifier.service';
import { GoogleProfile } from '../../src/modules/auth/domain/services/google-token-verifier.interface';
import { InvalidGoogleTokenException } from '../../src/modules/auth/domain/exceptions/invalid-google-token.exception';
```

**Antes:**

```typescript
const sentEmails: { kind: SentEmailKind; email: string; code: string }[] = [];
```

**Después:**

```typescript
const sentEmails: { kind: SentEmailKind; email: string; code: string }[] = [];

let googleProfile: GoogleProfile | null = null;

/** Configura lo que el spy de Google devuelve en el siguiente /auth/google */
export function mockGoogleProfile(profile: GoogleProfile | null): void {
  googleProfile = profile;
}
```

**Antes:**

```typescript
  jest
    .spyOn(EmailSenderService.prototype, 'sendPasswordResetCode')
    .mockImplementation((email: string, code: string) => {
      sentEmails.push({ kind: 'password_reset', email, code });
      return Promise.resolve();
    });
```

**Después:**

```typescript
  jest
    .spyOn(EmailSenderService.prototype, 'sendPasswordResetCode')
    .mockImplementation((email: string, code: string) => {
      sentEmails.push({ kind: 'password_reset', email, code });
      return Promise.resolve();
    });
  jest
    .spyOn(GoogleTokenVerifierService.prototype, 'verify')
    .mockImplementation(() => {
      if (!googleProfile) {
        return Promise.reject(new InvalidGoogleTokenException());
      }
      return Promise.resolve(googleProfile);
    });
```

**Antes:**

```typescript
  sentEmails.length = 0;
}
```

**Después:**

```typescript
  sentEmails.length = 0;
  googleProfile = null;
}
```

## Tests unitarios (`.spec.ts` junto a cada archivo — 5 nuevos, 2 actualizados)

## 16. `forgot-password.use-case.spec.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/forgot-password.use-case.spec.ts`

```typescript
import { Test } from '@nestjs/testing';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { VerificationCodeService } from '../services/verification-code.service';
import { ForgotPasswordUseCase } from './forgot-password.use-case';

describe('ForgotPasswordUseCase', () => {
  let useCase: ForgotPasswordUseCase;
  let users: jest.Mocked<IUserRepository>;
  let verificationCode: jest.Mocked<VerificationCodeService>;

  beforeEach(async () => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      save: jest.fn(),
    };
    verificationCode = {
      issue: jest.fn(),
      issuePasswordReset: jest.fn(),
    } as unknown as jest.Mocked<VerificationCodeService>;

    const module = await Test.createTestingModule({
      providers: [
        ForgotPasswordUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: VerificationCodeService, useValue: verificationCode },
      ],
    }).compile();
    useCase = module.get(ForgotPasswordUseCase);
  });

  it('emite código de reset para usuario activo', async () => {
    const u = Object.assign(new User(), { status: UserStatus.ACTIVE });
    users.findByEmail.mockResolvedValue(u);
    await useCase.execute({ email: 'A@B.com ' });
    expect(users.findByEmail).toHaveBeenCalledWith('a@b.com');
    expect(verificationCode.issuePasswordReset).toHaveBeenCalledWith(u);
  });

  it('emite código para cuenta solo-Google (sin passwordHash)', async () => {
    const u = Object.assign(new User(), {
      status: UserStatus.ACTIVE,
      passwordHash: null,
      googleId: 'g-1',
    });
    users.findByEmail.mockResolvedValue(u);
    await useCase.execute({ email: 'a@b.com' });
    expect(verificationCode.issuePasswordReset).toHaveBeenCalledWith(u);
  });

  it('silencia email inexistente (anti-enumeración)', async () => {
    users.findByEmail.mockResolvedValue(null);
    await useCase.execute({ email: 'a@b.com' });
    expect(verificationCode.issuePasswordReset).not.toHaveBeenCalled();
  });

  it('silencia usuario suspendido (anti-enumeración)', async () => {
    users.findByEmail.mockResolvedValue(
      Object.assign(new User(), { status: UserStatus.SUSPENDED }),
    );
    await useCase.execute({ email: 'a@b.com' });
    expect(verificationCode.issuePasswordReset).not.toHaveBeenCalled();
  });
});
```

## 17. `reset-password.use-case.spec.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/reset-password.use-case.spec.ts`

```typescript
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthToken } from '../../domain/entities/auth-token.entity';
import { User } from '../../domain/entities/user.entity';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { InvalidAuthCodeException } from '../../domain/exceptions/invalid-auth-code.exception';
import {
  AUTH_TOKEN_REPOSITORY,
  IAuthTokenRepository,
} from '../../domain/repositories/auth-token.repository.interface';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  CODE_GENERATOR,
  ICodeGenerator,
} from '../../domain/services/code-generator.interface';
import {
  IPasswordHasher,
  PASSWORD_HASHER,
} from '../../domain/services/password-hasher.interface';
import { SessionService } from '../services/session.service';
import { ResetPasswordUseCase } from './reset-password.use-case';

describe('ResetPasswordUseCase', () => {
  let useCase: ResetPasswordUseCase;
  let users: jest.Mocked<IUserRepository>;
  let authTokens: jest.Mocked<IAuthTokenRepository>;
  let refreshTokens: jest.Mocked<IRefreshTokenRepository>;
  let codeGen: jest.Mocked<ICodeGenerator>;
  let hasher: jest.Mocked<IPasswordHasher>;
  let session: jest.Mocked<SessionService>;

  const cmd = { email: 'a@b.com', code: '654321', newPassword: 'Nueva123!' };

  function activeUser(): User {
    const u = new User();
    u.id = 'u1';
    u.status = UserStatus.ACTIVE;
    return u;
  }

  function validToken(): AuthToken {
    const t = new AuthToken();
    t.id = 'tok-1';
    t.userId = 'u1';
    t.expiresAt = new Date(Date.now() + 60_000);
    return t;
  }

  beforeEach(async () => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      save: jest.fn(),
    };
    authTokens = {
      save: jest.fn(),
      findValidByHash: jest.fn(),
      consume: jest.fn().mockResolvedValue(true),
      consumePendingForUser: jest.fn(),
    };
    refreshTokens = {
      save: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    codeGen = {
      generateVerificationCode: jest.fn(),
      generateSessionToken: jest.fn(),
      generateReferralCode: jest.fn(),
      hashToken: jest.fn().mockReturnValue('sha256-of-code'),
    };
    hasher = { hash: jest.fn().mockResolvedValue('new-bcrypt'), verify: jest.fn() };
    session = {
      issue: jest
        .fn()
        .mockImplementation((u: User) =>
          Promise.resolve({ user: u, accessToken: 'at', refreshToken: 'rt' }),
        ),
    } as unknown as jest.Mocked<SessionService>;
    users.save.mockImplementation((u: User) => Promise.resolve(u));

    const module = await Test.createTestingModule({
      providers: [
        ResetPasswordUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: AUTH_TOKEN_REPOSITORY, useValue: authTokens },
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: refreshTokens },
        { provide: CODE_GENERATOR, useValue: codeGen },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: SessionService, useValue: session },
      ],
    }).compile();
    useCase = module.get(ResetPasswordUseCase);
  });

  it('resetea password, revoca sesiones previas y emite sesión nueva', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    authTokens.findValidByHash.mockResolvedValue(validToken());

    const result = await useCase.execute(cmd);

    expect(authTokens.findValidByHash).toHaveBeenCalledWith(
      'sha256-of-code',
      AuthTokenType.PASSWORD_RESET,
    );
    expect(hasher.hash).toHaveBeenCalledWith('Nueva123!');
    expect(users.save.mock.calls[0][0].passwordHash).toBe('new-bcrypt');
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    expect(result.accessToken).toBe('at');
  });

  it('rechaza email inexistente', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
    expect(authTokens.findValidByHash).not.toHaveBeenCalled();
  });

  it('rechaza token de otro usuario', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    const t = validToken();
    t.userId = 'otro';
    authTokens.findValidByHash.mockResolvedValue(t);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
  });

  it('rechaza token expirado', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    const t = validToken();
    t.expiresAt = new Date(Date.now() - 1000);
    authTokens.findValidByHash.mockResolvedValue(t);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
  });

  it('rechaza usuario suspendido', async () => {
    const u = activeUser();
    u.status = UserStatus.SUSPENDED;
    users.findByEmail.mockResolvedValue(u);
    authTokens.findValidByHash.mockResolvedValue(validToken());
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
  });

  it('rechaza si consume no afecta filas (carrera)', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    authTokens.findValidByHash.mockResolvedValue(validToken());
    authTokens.consume.mockResolvedValue(false);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
    expect(users.save).not.toHaveBeenCalled();
  });
});
```

## 18. `google-login.use-case.spec.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/google-login.use-case.spec.ts`

```typescript
import { Test } from '@nestjs/testing';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { UserSuspendedException } from '../../domain/exceptions/user-suspended.exception';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  GOOGLE_TOKEN_VERIFIER,
  GoogleProfile,
  IGoogleTokenVerifier,
} from '../../domain/services/google-token-verifier.interface';
import { ReferralCodeService } from '../services/referral-code.service';
import { SessionService } from '../services/session.service';
import { GoogleLoginUseCase } from './google-login.use-case';

describe('GoogleLoginUseCase', () => {
  let useCase: GoogleLoginUseCase;
  let users: jest.Mocked<IUserRepository>;
  let verifier: jest.Mocked<IGoogleTokenVerifier>;
  let referralCodes: jest.Mocked<ReferralCodeService>;
  let session: jest.Mocked<SessionService>;

  const profile: GoogleProfile = {
    googleId: 'g-123',
    email: 'Nuevo@Gmail.com',
    givenName: 'Ana',
    familyName: 'Pérez',
  };

  beforeEach(async () => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      save: jest.fn(),
    };
    verifier = { verify: jest.fn().mockResolvedValue(profile) };
    referralCodes = {
      generate: jest.fn().mockResolvedValue('REF12345'),
    } as unknown as jest.Mocked<ReferralCodeService>;
    session = {
      issue: jest
        .fn()
        .mockImplementation((u: User) =>
          Promise.resolve({ user: u, accessToken: 'at', refreshToken: 'rt' }),
        ),
    } as unknown as jest.Mocked<SessionService>;
    users.save.mockImplementation((u: User) => Promise.resolve(u));

    const module = await Test.createTestingModule({
      providers: [
        GoogleLoginUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: GOOGLE_TOKEN_VERIFIER, useValue: verifier },
        { provide: ReferralCodeService, useValue: referralCodes },
        { provide: SessionService, useValue: session },
      ],
    }).compile();
    useCase = module.get(GoogleLoginUseCase);
  });

  it('usuario nuevo → crea cuenta active con googleId y referralCode', async () => {
    users.findByGoogleId.mockResolvedValue(null);
    users.findByEmail.mockResolvedValue(null);

    const result = await useCase.execute({ idToken: 'tok' });

    const saved = users.save.mock.calls[0][0];
    expect(saved.email).toBe('nuevo@gmail.com');
    expect(saved.googleId).toBe('g-123');
    expect(saved.passwordHash).toBeNull();
    expect(saved.status).toBe(UserStatus.ACTIVE);
    expect(saved.firstName).toBe('Ana');
    expect(saved.referralCode).toBe('REF12345');
    expect(result.accessToken).toBe('at');
  });

  it('encuentra por googleId → login directo sin tocar la fila', async () => {
    const u = Object.assign(new User(), {
      googleId: 'g-123',
      status: UserStatus.ACTIVE,
    });
    users.findByGoogleId.mockResolvedValue(u);

    await useCase.execute({ idToken: 'tok' });

    expect(users.findByEmail).not.toHaveBeenCalled();
    expect(users.save).not.toHaveBeenCalled();
    expect(session.issue).toHaveBeenCalledWith(u, undefined, undefined);
  });

  it('encuentra por email sin googleId → vincula la cuenta', async () => {
    users.findByGoogleId.mockResolvedValue(null);
    const u = Object.assign(new User(), {
      googleId: null,
      status: UserStatus.ACTIVE,
    });
    users.findByEmail.mockResolvedValue(u);

    await useCase.execute({ idToken: 'tok' });

    expect(users.save.mock.calls[0][0].googleId).toBe('g-123');
  });

  it('pendiente de verificación → activa (email probado por Google)', async () => {
    users.findByGoogleId.mockResolvedValue(null);
    const u = Object.assign(new User(), {
      googleId: null,
      status: UserStatus.PENDING_VERIFICATION,
      emailVerifiedAt: null,
    });
    users.findByEmail.mockResolvedValue(u);

    await useCase.execute({ idToken: 'tok' });

    const saved = users.save.mock.calls[0][0];
    expect(saved.status).toBe(UserStatus.ACTIVE);
    expect(saved.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('suspendido → 403', async () => {
    users.findByGoogleId.mockResolvedValue(
      Object.assign(new User(), { status: UserStatus.SUSPENDED }),
    );
    await expect(useCase.execute({ idToken: 'tok' })).rejects.toBeInstanceOf(
      UserSuspendedException,
    );
    expect(session.issue).not.toHaveBeenCalled();
  });
});
```

## 19. `referral-code.service.spec.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/services/referral-code.service.spec.ts`

```typescript
import { Test } from '@nestjs/testing';
import { User } from '../../domain/entities/user.entity';
import { ReferralCodeGenerationException } from '../../domain/exceptions/referral-code-generation.exception';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  CODE_GENERATOR,
  ICodeGenerator,
} from '../../domain/services/code-generator.interface';
import { ReferralCodeService } from './referral-code.service';

describe('ReferralCodeService', () => {
  let service: ReferralCodeService;
  let users: jest.Mocked<IUserRepository>;
  let codeGen: jest.Mocked<ICodeGenerator>;

  beforeEach(async () => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      save: jest.fn(),
    };
    codeGen = {
      generateVerificationCode: jest.fn(),
      generateSessionToken: jest.fn(),
      generateReferralCode: jest.fn().mockReturnValue('ABC23456'),
      hashToken: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ReferralCodeService,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: CODE_GENERATOR, useValue: codeGen },
      ],
    }).compile();
    service = module.get(ReferralCodeService);
  });

  it('devuelve el primer código libre', async () => {
    users.findByReferralCode.mockResolvedValue(null);
    await expect(service.generate()).resolves.toBe('ABC23456');
  });

  it('reintenta cuando el código ya existe', async () => {
    codeGen.generateReferralCode
      .mockReturnValueOnce('TAKEN111')
      .mockReturnValueOnce('FREE2222');
    users.findByReferralCode
      .mockResolvedValueOnce(new User())
      .mockResolvedValue(null);
    await expect(service.generate()).resolves.toBe('FREE2222');
  });

  it('lanza excepción de dominio tras 5 intentos', async () => {
    users.findByReferralCode.mockResolvedValue(new User());
    await expect(service.generate()).rejects.toBeInstanceOf(
      ReferralCodeGenerationException,
    );
    expect(codeGen.generateReferralCode).toHaveBeenCalledTimes(5);
  });
});
```

## 20. `google-token-verifier.service.spec.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/services/google-token-verifier.service.spec.ts`

```typescript
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { InvalidGoogleTokenException } from '../../domain/exceptions/invalid-google-token.exception';
import { GoogleTokenVerifierService } from './google-token-verifier.service';

describe('GoogleTokenVerifierService', () => {
  let service: GoogleTokenVerifierService;
  let config: jest.Mocked<ConfigService>;
  let verifyIdToken: jest.SpyInstance;

  beforeEach(() => {
    config = {
      get: jest.fn().mockReturnValue(['client-id-1']),
    } as unknown as jest.Mocked<ConfigService>;
    verifyIdToken = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken');
    service = new GoogleTokenVerifierService(config);
  });

  afterEach(() => {
    verifyIdToken.mockRestore();
  });

  function ticket(payload: object | undefined) {
    return { getPayload: () => payload } as never;
  }

  it('devuelve el perfil cuando el token es válido y verificado', async () => {
    verifyIdToken.mockResolvedValue(
      ticket({
        sub: 'g-1',
        email: 'a@b.com',
        email_verified: true,
        given_name: 'Ana',
        family_name: 'P',
      }),
    );
    const profile = await service.verify('id-token');
    expect(profile).toEqual({
      googleId: 'g-1',
      email: 'a@b.com',
      givenName: 'Ana',
      familyName: 'P',
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'id-token',
      audience: ['client-id-1'],
    });
  });

  it('rechaza si Google rechaza el token', async () => {
    verifyIdToken.mockRejectedValue(new Error('invalid'));
    await expect(service.verify('bad')).rejects.toBeInstanceOf(
      InvalidGoogleTokenException,
    );
  });

  it('rechaza si email_verified no es true', async () => {
    verifyIdToken.mockResolvedValue(
      ticket({ sub: 'g-1', email: 'a@b.com', email_verified: false }),
    );
    await expect(service.verify('tok')).rejects.toBeInstanceOf(
      InvalidGoogleTokenException,
    );
  });

  it('rechaza si no hay client IDs configurados', async () => {
    config.get.mockReturnValue([]);
    await expect(service.verify('tok')).rejects.toBeInstanceOf(
      InvalidGoogleTokenException,
    );
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
```

## 21. Specs actualizados

**`register.use-case.spec.ts`** — `ReferralCodeService` reemplaza la lógica propia:
agregar `referralCodes: jest.Mocked<ReferralCodeService>` =
`{ generate: jest.fn().mockResolvedValue('ABCD2345') }` con provider
`{ provide: ReferralCodeService, useValue: referralCodes }`; quitar el mock de
`codeGen.generateReferralCode` (ya no se usa aquí — pasa al spec del service);
el `it` de "reintenta referral" (si existe) se mueve a `referral-code.service.spec`.

**`verification-code.service.spec.ts`** — agregar caso:

```typescript
  it('issuePasswordReset consume previos del tipo y envía por el canal de reset', async () => {
    const user = Object.assign(new User(), { id: 'u1', email: 'a@b.com' });
    await service.issuePasswordReset(user);

    expect(authTokens.consumePendingForUser).toHaveBeenCalledWith(
      'u1',
      AuthTokenType.PASSWORD_RESET,
    );
    expect(emailSender.sendPasswordResetCode).toHaveBeenCalledWith(
      'a@b.com',
      '654321',
    );
  });
```

## 22. `test/auth/forgot-password.e2e-spec.ts` (archivo nuevo)

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  cleanAuthTables,
  createE2EApp,
  lastCodeFor,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('POST /auth/forgot-password (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2EApp();
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
  });

  it('devuelve 200 genérico y emite código si el email existe', async () => {
    await registerUser(app, { email: 'a@b.com' });

    const res = await request(app.getHttpServer() as App)
      .post('/auth/forgot-password')
      .send({ email: 'a@b.com' })
      .expect(200);

    expect((res.body as { message: string }).message).toContain('reset code');
    expect(lastCodeFor('a@b.com', 'password_reset')).toMatch(/^\d{6}$/);
  });

  it('mismo 200 si el email no existe (anti-enumeración)', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/forgot-password')
      .send({ email: 'ghost@b.com' })
      .expect(200);

    expect((res.body as { message: string }).message).toContain('reset code');
  });

  it('rechaza email malformado → 400', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/forgot-password')
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  it('rechaza propiedades extra del body → 400', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/forgot-password')
      .send({ email: 'a@b.com', userId: 'x' })
      .expect(400);
  });
});
```

## 23. `test/auth/reset-password.e2e-spec.ts` (archivo nuevo)

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  activateAndGetTokens,
  cleanAuthTables,
  createE2EApp,
  lastCodeFor,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('POST /auth/reset-password (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2EApp();
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
  });

  async function requestReset(email: string): Promise<string> {
    await request(app.getHttpServer() as App)
      .post('/auth/forgot-password')
      .send({ email })
      .expect(200);
    return lastCodeFor(email, 'password_reset');
  }

  it('resetea la contraseña, emite sesión y permite login con la nueva', async () => {
    await registerUser(app, { email: 'a@b.com' });
    await activateAndGetTokens(app, 'a@b.com');
    const code = await requestReset('a@b.com');

    const res = await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code, newPassword: 'NuevaPass9' })
      .expect(200);

    const body = res.body as { accessToken: string; refreshToken: string };
    expect(body.accessToken).toBeTruthy();

    await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email: 'a@b.com', password: 'NuevaPass9' })
      .expect(200);
    await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email: 'a@b.com', password: 'Password1!' })
      .expect(401);
  });

  it('revoca todas las sesiones previas al reset', async () => {
    await registerUser(app, { email: 'a@b.com' });
    const { accessToken } = await activateAndGetTokens(app, 'a@b.com');
    const code = await requestReset('a@b.com');

    await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code, newPassword: 'NuevaPass9' })
      .expect(200);

    // La sesión previa al reset quedó muerta
    await request(app.getHttpServer() as App)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('rechaza código errado → 400', async () => {
    await registerUser(app, { email: 'a@b.com' });
    await activateAndGetTokens(app, 'a@b.com');
    await requestReset('a@b.com');

    await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code: '000000', newPassword: 'NuevaPass9' })
      .expect(400);
  });

  it('rechaza reusar el mismo código → 400', async () => {
    await registerUser(app, { email: 'a@b.com' });
    await activateAndGetTokens(app, 'a@b.com');
    const code = await requestReset('a@b.com');

    await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code, newPassword: 'NuevaPass9' })
      .expect(200);
    await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code, newPassword: 'OtraPass88' })
      .expect(400);
  });

  it('un segundo forgot invalida el código anterior', async () => {
    await registerUser(app, { email: 'a@b.com' });
    await activateAndGetTokens(app, 'a@b.com');
    const first = await requestReset('a@b.com');
    await requestReset('a@b.com'); // emite otro y consume el anterior

    await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code: first, newPassword: 'NuevaPass9' })
      .expect(400);
  });

  it('rechaza password corto → 400', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/reset-password')
      .send({ email: 'a@b.com', code: '123456', newPassword: 'short' })
      .expect(400);
  });
});
```

## 24. `test/auth/google.e2e-spec.ts` (archivo nuevo)

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  cleanAuthTables,
  createE2EApp,
  mockGoogleProfile,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('POST /auth/google (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2EApp();
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
  });

  it('crea cuenta nueva y devuelve sesión', async () => {
    mockGoogleProfile({
      googleId: 'g-1',
      email: 'nuevo@gmail.com',
      givenName: 'Ana',
      familyName: 'P',
    });

    const res = await request(app.getHttpServer() as App)
      .post('/auth/google')
      .send({ idToken: 'fake-id-token' })
      .expect(200);

    const body = res.body as {
      accessToken: string;
      refreshToken: string;
      user: { email: string; status: string };
    };
    expect(body.accessToken).toBeTruthy();
    expect(body.user.email).toBe('nuevo@gmail.com');
    expect(body.user.status).toBe('active');

    const ds = app.get(DataSource);
    const rows = (await ds.query(
      `SELECT google_id, password_hash, referral_code FROM users WHERE email = 'nuevo@gmail.com'`,
    )) as { google_id: string; password_hash: string | null; referral_code: string }[];
    expect(rows[0].google_id).toBe('g-1');
    expect(rows[0].password_hash).toBeNull();
    expect(rows[0].referral_code).toBeTruthy();
  });

  it('reutiliza la cuenta por googleId (sin duplicar usuario)', async () => {
    mockGoogleProfile({
      googleId: 'g-1',
      email: 'nuevo@gmail.com',
      givenName: 'Ana',
      familyName: null,
    });
    await request(app.getHttpServer() as App)
      .post('/auth/google')
      .send({ idToken: 'fake' })
      .expect(200);
    await request(app.getHttpServer() as App)
      .post('/auth/google')
      .send({ idToken: 'fake' })
      .expect(200);

    const ds = app.get(DataSource);
    const rows = (await ds.query(
      `SELECT COUNT(*)::int AS c FROM users WHERE email = 'nuevo@gmail.com'`,
    )) as { c: number }[];
    expect(rows[0].c).toBe(1);
  });

  it('vincula googleId a cuenta existente por email', async () => {
    await registerUser(app, { email: 'a@b.com' });
    mockGoogleProfile({
      googleId: 'g-link',
      email: 'a@b.com',
      givenName: 'A',
      familyName: null,
    });

    await request(app.getHttpServer() as App)
      .post('/auth/google')
      .send({ idToken: 'fake' })
      .expect(200);

    const ds = app.get(DataSource);
    const rows = (await ds.query(
      `SELECT google_id FROM users WHERE email = 'a@b.com'`,
    )) as { google_id: string }[];
    expect(rows[0].google_id).toBe('g-link');
  });

  it('rechaza token inválido (spy sin perfil) → 401', async () => {
    mockGoogleProfile(null);
    await request(app.getHttpServer() as App)
      .post('/auth/google')
      .send({ idToken: 'fake' })
      .expect(401);
  });

  it('rechaza propiedades extra del body → 400', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/google')
      .send({ idToken: 'fake', role: 'admin' })
      .expect(400);
  });
});
```

## 25. `documentacion/api/auth/008-post-forgot-password.md` (archivo nuevo)

```markdown
# POST /auth/forgot-password

> Solicita un código de reset de contraseña. Respuesta siempre genérica
> (anti-enumeración).

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/forgot-password` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 3 req/min |
| **Implementado** | propuesta 003 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `email` | string | sí | `IsEmail` | |

```json
{ "email": "ana@test.com" }
```

## Responses

### 200 — Mensaje genérico
```json
{ "message": "If that email is registered, a reset code has been sent." }
```
Idéntico exista o no el email (anti-enumeración). El código de 6 dígitos llega
por email y se canjea en `POST /auth/reset-password`.

### 400 — Validación
```json
{ "statusCode": 400, "message": ["email must be an email"], "timestamp": "..." }
```

## Notas

- El código vence a los 15 min (configurable vía `AUTH_CODE_TTL_MINUTES`) y un
  nuevo `forgot-password` invalida el anterior.
- Usuarios "solo-Google" también pueden resetear — el reset les crea una
  contraseña acreditada por posesión del email.
```

## 26. `documentacion/api/auth/009-post-reset-password.md` (archivo nuevo)

```markdown
# POST /auth/reset-password

> Canjea el código de reset: cambia la contraseña, **mata todas las sesiones
> previas** y devuelve una sesión nueva.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/reset-password` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 5 req/min |
| **Implementado** | propuesta 003 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `email` | string | sí | `IsEmail` | |
| `code` | string | sí | `^\d{6}$` | Código del email de reset |
| `newPassword` | string | sí | `MinLength(8)` `MaxLength(72)` | |
| `deviceFingerprint` | string | no | `MaxLength(255)` | |
| `platform` | string | no | `android` \| `ios` | |

```json
{ "email": "ana@test.com", "code": "483920", "newPassword": "NuevaPass9" }
```

## Responses

### 200 — Password cambiada + sesión nueva
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "X9v2...",
  "user": { "id": "...", "email": "ana@test.com", "status": "active", "...": "..." }
}
```

### 400 — Código inválido/expirado/consumido
```json
{ "statusCode": 400, "message": "Invalid or expired code", "timestamp": "..." }
```
Mismo mensaje para cualquier fallo del código — no revela qué falló.

## Notas

- Todas las `refresh_tokens` del usuario quedan revocadas (seguridad post-cambio
  de credencial) — los dispositivos previos deben hacer login de nuevo.
- El código es de un solo uso; el hash (no el plano) se persiste en
  `auth_tokens.token_hash`.
```

## 27. `documentacion/api/auth/010-post-google.md` (archivo nuevo)

```markdown
# POST /auth/google

> Login/registro con `idToken` de Google Sign-In. Si el email es nuevo crea la
> cuenta directo en `active` (Google ya probó el correo); si existe la cuenta
> por email la vincula (`google_id`).

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/google` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 5 req/min |
| **Implementado** | propuesta 003 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `idToken` | string | sí | `MinLength(10)` `MaxLength(4096)` | Token emitido por Google Sign-In del cliente |
| `deviceFingerprint` | string | no | `MaxLength(255)` | |
| `platform` | string | no | `android` \| `ios` | |

```json
{ "idToken": "eyJhbGciOiJSUzI1NiIs...", "deviceFingerprint": "a1b2c3", "platform": "android" }
```

## Responses

### 200 — Sesión emitida
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "X9v2...",
  "user": { "id": "...", "email": "ana@gmail.com", "status": "active", "...": "..." }
}
```

### 401 — Token inválido
```json
{ "statusCode": 401, "message": "Invalid Google token", "timestamp": "..." }
```
Incluye: firma/audiencia inválida, token expirado, `email_verified=false`, o
endpoint sin `GOOGLE_CLIENT_IDS` configurados.

### 403 — Cuenta suspendida
```json
{ "statusCode": 403, "message": "Account is suspended", "timestamp": "..." }
```

## Notas

- Requiere `GOOGLE_CLIENT_IDS` (comma-separated, por plataforma cliente) en el
  entorno — la verificación corre contra los JWKS de Google via `google-auth-library`.
- La cuenta creada por Google nace sin `password_hash` — puede crear una después
  por `forgot-password` + `reset-password` (acredita posesión del email).
- Si el email ya tenía cuenta `pending_verification`, queda `active`.
```

## 28. `documentacion/api/README.md` (archivo existente — actualización)

**Antes:**

```markdown
| GET | `/auth/me` | [007](auth/007-get-me.md) | 🔶 backend listo — sin integrar |
```

**Después:**

```markdown
| GET | `/auth/me` | [007](auth/007-get-me.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/forgot-password` | [008](auth/008-post-forgot-password.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/reset-password` | [009](auth/009-post-reset-password.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/google` | [010](auth/010-post-google.md) | 🔶 backend listo — sin integrar |
```

## Orden de aplicación recomendado

1. `npm install google-auth-library` (sección 14)
2. DTOs (3) — sección 3
3. `google-token-verifier.interface.ts` + `invalid-google-token.exception.ts` — secciones 4-5
4. `referral-code.service.ts` — sección 7
5. `verification-code.service.ts` (refactor — antes que los use-cases que llaman `issuePasswordReset`) — sección 9
6. Use-cases (3) — sección 8
7. `google-token-verifier.service.ts` — sección 10
8. `register.use-case.ts` (usa ReferralCodeService) — sección 11
9. `auth.service.ts` (stub → métodos completos) — secciones 2→6→13
10. `auth.controller.ts` (3 rutas) — secciones 1→6
11. `auth.module.ts` (providers) — sección 12
12. `test/support/e2e-app.ts` (spy de Google) — sección 15
13. Specs unitarios (5 nuevos + 2 actualizados) — secciones 16-21
14. Specs e2e (3) — secciones 22-24
15. Docs de API (3 + README) — secciones 25-28
16. Verificación: `lint` → `build` → `test` → `test:e2e`

## Checklist final (propuesta-workflow)

- [x] Endpoints nuevos: controller stub → DTOs → controller completo → service → use-cases → dominio → infra → wiring → tests → docs
- [x] Sin migración: usa columnas/enums de 002 (`google_id`, `password_reset`)
- [x] `new-endpoint-checklist` aplicado a los 3 endpoints
- [x] `unit-test-checklist`: specs para 3 use-cases + referral-code + verifier
- [x] `idor-checklist`: ningún endpoint recibe identificadores de recursos; `forbidNonWhitelisted` cubierto en e2e (`userId`, `role` extra → 400)
- [x] Anti-enumeración en `forgot-password` (siempre 200) y `reset-password` (400 genérico)
- [x] Seguridad Google: `email_verified=true` exigido, audiencia verificada, nunca loguear el `idToken`
- [x] `api-docs`: 3 docs nuevos + índice actualizado en la misma propuesta
- [x] Refactor mínimo: `VerificationCodeService.issueToken` + `ReferralCodeService` extraído (sin cambio de contrato en endpoints de 002)

## Correcciones post-revisión (aplicadas tras auditoría del revisor)

1. **`reset-password.use-case.ts`**: un usuario `pending_verification` que
   resetea su password quedaba en limbo (sesión emitida pero `/me`, `/refresh`
   y `/login` lo rechazaban). Fix: tras validar el código — que prueba posesión
   del email — el usuario pending pasa a `active` + `emailVerifiedAt`, misma
   regla que Google login. Test nuevo en el spec.
2. **`google-login.use-case.ts`**: `givenName`/`familyName` del perfil de
   Google no se truncaban → un valor >100 chars rompía contra
   `varchar(100)` con un 500. Fix: `.slice(0, 100)` en ambos. Test nuevo.
3. **`register.use-case.ts`**: se eliminó la inyección muerta de
   `CODE_GENERATOR` (la propuesta la mantenía; quedó dead code tras extraer
   `ReferralCodeService`) + mock correspondiente del spec.
4. **`user.repository.ts` + excepción nueva**: el constraint
   `uq_users_google_id` (carrera vinculando el mismo Google a dos cuentas)
   no estaba mapeado → 500 crudo. Fix: `GoogleAccountAlreadyLinkedException`
   (409) nueva en `domain/exceptions/` y mapeo en `save()`.
5. **`documentacion/api/README.md`**: la línea de device fingerprint ahora
   incluye `reset-password` y `google`.
6. **`auth.service.ts`**: imports de use-cases ordenados alfabéticamente.

Desviaciones del implementador (aceptadas): `idToken: 'fake-id-token'` en e2e
(pasa `@MinLength(10)`); `ds.query<T[]>` sin cast; import sin uso removido en
`reset-password.use-case.spec`; mock `issuePasswordReset` agregado al spec de
`resend-verification` (compilación); stubs intermedios escritos directo en su
estado final.

**Verificación final**: lint 0/0, build OK, 93/93 unit tests, 47/47 e2e.

