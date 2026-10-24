# Propuesta: Módulo `auth` — registro, verificación de email, login y sesiones

Primer módulo de negocio sobre el bootstrap de 001. Implementa el ciclo completo de credenciales y sesión según `documentacion/modelo-de-datos.md` (módulo `auth` aprobado): registro con verificación obligatoria de email, login con rotación de refresh tokens, logout y perfil.

**Queda fuera de alcance (propuesta 003):** `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/google` y endpoints de `devices` (push token). La migración ya crea las 5 tablas del modelo — incluidas `addresses` y `devices` — para que 003 sea puramente aditiva.

Dependencias nuevas: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt` + dev `@types/passport-jwt`, `@types/passport`.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `package.json` | Agregar deps auth + exclusiones de `collectCoverageFrom` |
| `src/config/auth.config.ts` | **Nuevo** — namespace `auth` (JWT, TTLs, Google ids) |
| `src/config/email.config.ts` | **Nuevo** — namespace `email` (Resend) |
| `src/config/env.validation.ts` | Agregar `JWT_SECRET` (requerido) y TTLs opcionales |
| `src/common/decorators/public.decorator.ts` | **Nuevo** — `@Public()` |
| `src/common/decorators/current-user.decorator.ts` | **Nuevo** — `@CurrentUser()` + `AuthenticatedUser` |
| `src/common/decorators/roles.decorator.ts` | **Nuevo** — `@Roles()` |
| `src/common/guards/jwt-auth.guard.ts` | **Nuevo** — `APP_GUARD` global con bypass `@Public()` |
| `src/common/guards/roles.guard.ts` | **Nuevo** — opt-in por ruta (queda listo para endpoints admin) |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | **Nuevo** — 7 endpoints |
| `src/modules/auth/application/services/auth.service.ts` | **Nuevo** — orquestación |
| `src/modules/auth/application/services/session.service.ts` | **Nuevo** — emisión de par access/refresh + upsert device |
| `src/modules/auth/application/services/verification-code.service.ts` | **Nuevo** — genera/persiste/envía código de verificación |
| `src/modules/auth/application/dtos/*.dto.ts` | **Nuevos** — 5 de entrada + 4 de respuesta |
| `src/modules/auth/application/mappers/auth.mapper.ts` | **Nuevo** |
| `src/modules/auth/application/use-cases/*.use-case.ts` | **Nuevos** — 7 use-cases |
| `src/modules/auth/domain/entities/*.entity.ts` | **Nuevos** — 5 entidades |
| `src/modules/auth/domain/enums/*.enum.ts` | **Nuevos** — 3 enums |
| `src/modules/auth/domain/exceptions/*.exception.ts` | **Nuevos** — 9 excepciones |
| `src/modules/auth/domain/repositories/*.repository.interface.ts` | **Nuevos** — 4 interfaces + tokens |
| `src/modules/auth/infrastructure/repositories/*.repository.ts` | **Nuevos** — 4 impls TypeORM |
| `src/modules/auth/infrastructure/services/password-hasher.service.ts` | **Nuevo** — bcrypt |
| `src/modules/auth/infrastructure/services/code-generator.service.ts` | **Nuevo** — códigos 6 dígitos, tokens opacos, referral code |
| `src/modules/auth/infrastructure/services/email-sender.service.ts` | **Nuevo** — Resend API vía `fetch`; fallback a log sin API key |
| `src/modules/auth/infrastructure/strategies/jwt.strategy.ts` | **Nuevo** — passport-jwt |
| `src/modules/auth/auth.module.ts` | **Nuevo** — wiring del módulo |
| `src/infrastructure/database/migrations/<ts>-CreateAuthTables.ts` | **Nuevo** — citext + 3 enums + 5 tablas |
| `src/infrastructure/database/schemas/*.schema.ts` | **Nuevos** — 5 EntitySchema |
| `src/app.module.ts` | `authConfig` en `load`, `AuthModule`, `JwtAuthGuard` global, quitar App* |
| `src/infrastructure/health/health.controller.ts` | Agregar `@Public()` |
| `.env.example` | Agregar `JWT_*`, `AUTH_CODE_TTL_MINUTES`, `GOOGLE_CLIENT_IDS` |
| `.env` / `.env.test` | Agregar `JWT_SECRET` (valor generado local, distinto por archivo) + TTLs |
| `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts` | **Eliminar** — scaffold Hello World sin uso |
| `test/app.e2e-spec.ts` | **Eliminar** — probaba `GET /` del scaffold |
| `test/support/e2e-app.ts` | Agregar spy de `EmailSenderService`, `cleanAuthTables`, helpers `registerUser`/`activateAndGetTokens`/`lastCodeFor` |
| `test/auth/*.e2e-spec.ts` | **Nuevos** — 7 specs, uno por endpoint |
| `**/*.spec.ts` (unitarios) | **Nuevos** — 19 specs junto a su archivo |
| `documentacion/api/README.md` + `documentacion/api/auth/001-007` | **Nuevos** — índice + 7 docs de endpoints |
| `pendientes/002-envio-email-real.md` + `pendientes/README.md` | **Nuevo** pendiente — verificar dominio en Resend |

## Desviaciones al modelo documentado (registro — `modelo-evolucion`)

Detalles de implementación que el doc no especificaba; ninguno cambia columnas ni constraints:

1. `refresh_tokens.device_id` → `ON DELETE SET NULL` (el modelo no definía acción de borrado; SET NULL conserva la sesión aunque se elimine el device).
2. Los `EntitySchema` **no declaran relaciones TypeORM**: los FKs existen solo a nivel BD y las entidades guardan el `uuid` plano. Cierra de raíz el riesgo N+1 (no hay lazy/eager loading que disparar).
3. `updated_at` lo mantiene TypeORM (`updateDate`), sin trigger en BD — toda escritura pasa por el ORM.
4. `devices.last_seen_at` se actualiza en register/verify/login cuando el cliente manda `deviceFingerprint` (`touch` upsert).
5. `users.email` UNIQUE incluye filas soft-deleted: re-registrar un email de una cuenta borrada da 409 hasta que exista borrado físico (futuro admin).
6. `POST /auth/register` **no devuelve tokens**: la sesión solo nace al verificar el email (`verify-email` devuelve `{accessToken, refreshToken, user}`), porque `pending_verification` bloquea login.
7. Códigos de verificación/reset: **6 dígitos** en `auth_tokens.token_hash` (sha256) — pensado para app móvil sin deep-links.
8. `google_id` y `email` UNIQUE incluidos en la misma migración aunque el endpoint Google llega en 003 — la columna ya está en el modelo.

## Decisiones de seguridad integradas

- `JwtAuthGuard` como `APP_GUARD` global + `@Public()` opt-out → `health.controller` recibe `@Public()`.
- JWT payload `{sub, sid, email, role}`: `sid` = id de la fila `refresh_tokens` → `GET /auth/me` y `logout` verifican sesión viva; el resto de endpoints solo firma (TTL 15 min acota la ventana tras suspensión).
- Rotación de refresh: cada `POST /auth/refresh` revoca el presentado y emite uno nuevo. **Reuso de token revocado = sesión comprometida** → se revocan TODAS las sesiones del usuario.
- Tokens/códigos siempre en BD como sha256 — nunca planos.
- `@Throttle` por endpoint: register/resend 3/min, login/verify 5/min, refresh 10/min (independientes del global 100/min).
- Anti-enumeración: `resend-verification` responde 200 genérico siempre; `login` responde el mismo 401 para email inexistente y password errado; `verify-email` responde "Invalid or expired code" genérico.
- `registered_ip` se captura de `req.ip` en register (señal anti-fraude pasiva).
- Mass-assignment: `role`, `status`, `emailVerifiedAt` no existen en los DTOs → `forbidNonWhitelisted` los rechaza con 400.

---

## 1. `auth.controller.ts` (archivo nuevo — stub)

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

```typescript
import { Controller } from '@nestjs/common';
import { AuthService } from '../../application/services/auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
}
```

## 2. `auth.service.ts` (archivo nuevo — stub)

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {}
```

## 3. `register.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/register.dto.ts`

```typescript
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @Length(1, 100)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  referralCode?: string;

  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceFingerprint?: string;

  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: string;
}
```

## 4. `verify-email.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/verify-email.dto.ts`

```typescript
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceFingerprint?: string;

  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: string;
}
```

## 5. `resend-verification.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/resend-verification.dto.ts`

```typescript
import { IsEmail } from 'class-validator';

export class ResendVerificationDto {
  @IsEmail()
  email!: string;
}
```

## 6. `login.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/login.dto.ts`

```typescript
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceFingerprint?: string;

  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: string;
}
```

## 7. `refresh-token.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/refresh-token.dto.ts`

```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
```

## 8. `user-response.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/user-response.dto.ts`

```typescript
export class UserResponseDto {
  id!: string;
  email!: string;
  firstName!: string;
  lastName!: string | null;
  phone!: string | null;
  role!: string;
  status!: string;
  emailVerifiedAt!: string | null;
  referralCode!: string;
  marketingOptIn!: boolean;
  createdAt!: string;
}
```

## 9. `auth-response.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/auth-response.dto.ts`

```typescript
import { UserResponseDto } from './user-response.dto';

export class AuthResponseDto {
  accessToken!: string;
  refreshToken!: string;
  user!: UserResponseDto;
}
```

## 10. `tokens-response.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/tokens-response.dto.ts`

```typescript
export class TokensResponseDto {
  accessToken!: string;
  refreshToken!: string;
}
```

## 11. `message-response.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/message-response.dto.ts`

```typescript
export class MessageResponseDto {
  message!: string;
}
```

## 12. `public.decorator.ts` (archivo nuevo)

**Ruta:** `src/common/decorators/public.decorator.ts`

```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

## 13. `current-user.decorator.ts` (archivo nuevo)

**Ruta:** `src/common/decorators/current-user.decorator.ts`

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();
    return request.user;
  },
);
```

## 14. `roles.decorator.ts` (archivo nuevo)

**Ruta:** `src/common/decorators/roles.decorator.ts`

```typescript
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

## 15. `auth.controller.ts` (actualización — endpoints completos)

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

Reemplazar el archivo completo:

```typescript
import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { AuthService } from '../../application/services/auth.service';
import { RegisterDto } from '../../application/dtos/register.dto';
import { VerifyEmailDto } from '../../application/dtos/verify-email.dto';
import { ResendVerificationDto } from '../../application/dtos/resend-verification.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { RefreshTokenDto } from '../../application/dtos/refresh-token.dto';

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
```

## 16. `auth.mapper.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/mappers/auth.mapper.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { User } from '../../domain/entities/user.entity';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { UserResponseDto } from '../dtos/user-response.dto';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthMapper {
  toUserResponse(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.phone = user.phone;
    dto.role = user.role;
    dto.status = user.status;
    dto.emailVerifiedAt = user.emailVerifiedAt?.toISOString() ?? null;
    dto.referralCode = user.referralCode;
    dto.marketingOptIn = user.marketingOptIn;
    dto.createdAt = user.createdAt.toISOString();
    return dto;
  }

  toAuthResponse(user: User, tokens: IssuedTokens): AuthResponseDto {
    const dto = new AuthResponseDto();
    dto.accessToken = tokens.accessToken;
    dto.refreshToken = tokens.refreshToken;
    dto.user = this.toUserResponse(user);
    return dto;
  }
}
```

## 17. `auth.service.ts` (actualización — métodos completos)

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

Reemplazar el archivo completo:

```typescript
import { Injectable } from '@nestjs/common';
import { AuthMapper } from '../mappers/auth.mapper';
import { LoginUseCase } from '../use-cases/login.use-case';
import { LogoutUseCase } from '../use-cases/logout.use-case';
import { GetMeUseCase } from '../use-cases/get-me.use-case';
import { RefreshUseCase } from '../use-cases/refresh.use-case';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { ResendVerificationUseCase } from '../use-cases/resend-verification.use-case';
import { VerifyEmailUseCase } from '../use-cases/verify-email.use-case';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { LoginDto } from '../dtos/login.dto';
import { MessageResponseDto } from '../dtos/message-response.dto';
import { RefreshTokenDto } from '../dtos/refresh-token.dto';
import { RegisterDto } from '../dtos/register.dto';
import { ResendVerificationDto } from '../dtos/resend-verification.dto';
import { TokensResponseDto } from '../dtos/tokens-response.dto';
import { UserResponseDto } from '../dtos/user-response.dto';
import { VerifyEmailDto } from '../dtos/verify-email.dto';

const GENERIC_RESEND_MESSAGE =
  'If that email is registered and unverified, a new code has been sent.';

@Injectable()
export class AuthService {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    private readonly resendVerificationUseCase: ResendVerificationUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshUseCase,
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
      await this.verifyEmailUseCase.execute(dto);
    return this.authMapper.toAuthResponse(user, { accessToken, refreshToken });
  }

  async resendVerification(
    dto: ResendVerificationDto,
  ): Promise<MessageResponseDto> {
    await this.resendVerificationUseCase.execute(dto);
    const response = new MessageResponseDto();
    response.message = GENERIC_RESEND_MESSAGE;
    return response;
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const { user, accessToken, refreshToken } = await this.loginUseCase.execute(
      dto,
    );
    return this.authMapper.toAuthResponse(user, { accessToken, refreshToken });
  }

  async refresh(dto: RefreshTokenDto): Promise<TokensResponseDto> {
    const tokens = await this.refreshUseCase.execute(dto);
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
}
```

## 18. `user.entity.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/entities/user.entity.ts`

```typescript
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';

export class User {
  id!: string;
  email!: string;
  passwordHash: string | null = null;
  googleId: string | null = null;
  role: UserRole = UserRole.CUSTOMER;
  status: UserStatus = UserStatus.PENDING_VERIFICATION;
  emailVerifiedAt: Date | null = null;
  firstName!: string;
  lastName: string | null = null;
  phone: string | null = null;
  registeredIp: string | null = null;
  referralCode!: string;
  referredBy: string | null = null;
  marketingOptIn = false;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt: Date | null = null;
}
```

## 19. `address.entity.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/entities/address.entity.ts`

```typescript
export class Address {
  id!: string;
  userId!: string;
  label!: string;
  addressLine!: string;
  reference: string | null = null;
  latitude: number | null = null;
  longitude: number | null = null;
  isDefault = false;
  createdAt!: Date;
  updatedAt!: Date;
}
```

## 20. `device.entity.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/entities/device.entity.ts`

```typescript
export class Device {
  id!: string;
  userId!: string;
  fingerprint!: string;
  platform: string | null = null;
  pushToken: string | null = null;
  notificationsEnabled = true;
  createdAt!: Date;
  lastSeenAt!: Date;
}
```

## 21. `auth-token.entity.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/entities/auth-token.entity.ts`

```typescript
import { AuthTokenType } from '../enums/auth-token-type.enum';

export class AuthToken {
  id!: string;
  userId!: string;
  tokenHash!: string;
  type!: AuthTokenType;
  expiresAt!: Date;
  consumedAt: Date | null = null;
  createdAt!: Date;
}
```

## 22. `refresh-token.entity.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/entities/refresh-token.entity.ts`

```typescript
export class RefreshToken {
  id!: string;
  userId!: string;
  deviceId: string | null = null;
  tokenHash!: string;
  expiresAt!: Date;
  revokedAt: Date | null = null;
  createdAt!: Date;
}
```

## 23. `user-role.enum.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/enums/user-role.enum.ts`

```typescript
export enum UserRole {
  CUSTOMER = 'customer',
  ADMIN = 'admin',
}
```

## 24. `user-status.enum.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/enums/user-status.enum.ts`

```typescript
export enum UserStatus {
  PENDING_VERIFICATION = 'pending_verification',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}
```

## 25. `auth-token-type.enum.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/enums/auth-token-type.enum.ts`

```typescript
export enum AuthTokenType {
  EMAIL_VERIFICATION = 'email_verification',
  PASSWORD_RESET = 'password_reset',
}
```


## 26. Excepciones de dominio (9 archivos nuevos)

Cada una hereda de `DomainException` (ver skill `code-patterns`).

**`src/modules/auth/domain/exceptions/email-already-registered.exception.ts`**

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class EmailAlreadyRegisteredException extends DomainException {
  constructor() {
    super('Email is already registered', 409);
  }
}
```

**`src/modules/auth/domain/exceptions/invalid-referral-code.exception.ts`**

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidReferralCodeException extends DomainException {
  constructor() {
    super('Invalid referral code', 400);
  }
}
```

**`src/modules/auth/domain/exceptions/invalid-auth-code.exception.ts`**

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidAuthCodeException extends DomainException {
  constructor() {
    super('Invalid or expired code', 400);
  }
}
```

**`src/modules/auth/domain/exceptions/invalid-credentials.exception.ts`**

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super('Invalid credentials', 401);
  }
}
```

**`src/modules/auth/domain/exceptions/email-not-verified.exception.ts`**

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class EmailNotVerifiedException extends DomainException {
  constructor() {
    super('Email is not verified', 403);
  }
}
```

**`src/modules/auth/domain/exceptions/user-suspended.exception.ts`**

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class UserSuspendedException extends DomainException {
  constructor() {
    super('Account is suspended', 403);
  }
}
```

**`src/modules/auth/domain/exceptions/invalid-refresh-token.exception.ts`**

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidRefreshTokenException extends DomainException {
  constructor() {
    super('Invalid or expired session', 401);
  }
}
```

**`src/modules/auth/domain/exceptions/compromised-session.exception.ts`**

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class CompromisedSessionException extends DomainException {
  constructor() {
    super('Session expired, please log in again', 401);
  }
}
```

**`src/modules/auth/domain/exceptions/session-not-found.exception.ts`**

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class SessionNotFoundException extends DomainException {
  constructor() {
    super('Session is no longer valid', 401);
  }
}
```

## 27. `user.repository.interface.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/repositories/user.repository.interface.ts`

```typescript
import { User } from '../entities/user.entity';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByGoogleId(googleId: string): Promise<User | null>;
  findByReferralCode(code: string): Promise<User | null>;
  save(user: User): Promise<User>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');
```

## 28. `device.repository.interface.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/repositories/device.repository.interface.ts`

```typescript
import { Device } from '../entities/device.entity';

export interface IDeviceRepository {
  findByUserAndFingerprint(
    userId: string,
    fingerprint: string,
  ): Promise<Device | null>;
  touch(
    userId: string,
    fingerprint: string,
    platform: string | null,
  ): Promise<Device>;
}

export const DEVICE_REPOSITORY = Symbol('IDeviceRepository');
```

## 29. `auth-token.repository.interface.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/repositories/auth-token.repository.interface.ts`

```typescript
import { AuthToken } from '../entities/auth-token.entity';
import { AuthTokenType } from '../enums/auth-token-type.enum';

export interface IAuthTokenRepository {
  save(token: AuthToken): Promise<AuthToken>;
  findValidByHash(
    tokenHash: string,
    type: AuthTokenType,
  ): Promise<AuthToken | null>;
  consume(id: string): Promise<void>;
  consumePendingForUser(userId: string, type: AuthTokenType): Promise<void>;
}

export const AUTH_TOKEN_REPOSITORY = Symbol('IAuthTokenRepository');
```

## 30. `refresh-token.repository.interface.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/repositories/refresh-token.repository.interface.ts`

```typescript
import { RefreshToken } from '../entities/refresh-token.entity';

export interface IRefreshTokenRepository {
  save(token: RefreshToken): Promise<RefreshToken>;
  findById(id: string): Promise<RefreshToken | null>;
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('IRefreshTokenRepository');
```

## 31. `verification-code.service.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/services/verification-code.service.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthToken } from '../../domain/entities/auth-token.entity';
import { User } from '../../domain/entities/user.entity';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import {
  AUTH_TOKEN_REPOSITORY,
  IAuthTokenRepository,
} from '../../domain/repositories/auth-token.repository.interface';
import { CodeGeneratorService } from '../../infrastructure/services/code-generator.service';
import { EmailSenderService } from '../../infrastructure/services/email-sender.service';

@Injectable()
export class VerificationCodeService {
  constructor(
    @Inject(AUTH_TOKEN_REPOSITORY)
    private readonly authTokens: IAuthTokenRepository,
    private readonly codeGenerator: CodeGeneratorService,
    private readonly emailSender: EmailSenderService,
    private readonly config: ConfigService,
  ) {}

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
    await this.emailSender.sendVerificationCode(user.email, code);
  }
}
```

## 32. `session.service.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/services/session.service.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { User } from '../../domain/entities/user.entity';
import {
  DEVICE_REPOSITORY,
  IDeviceRepository,
} from '../../domain/repositories/device.repository.interface';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import { CodeGeneratorService } from '../../infrastructure/services/code-generator.service';
import { IssuedTokens } from '../mappers/auth.mapper';

export interface IssuedSession extends IssuedTokens {
  user: User;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: IDeviceRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: IRefreshTokenRepository,
    private readonly codeGenerator: CodeGeneratorService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issue(
    user: User,
    deviceFingerprint?: string,
    platform?: string,
  ): Promise<IssuedSession> {
    let deviceId: string | null = null;
    if (deviceFingerprint) {
      const device = await this.devices.touch(
        user.id,
        deviceFingerprint,
        platform ?? null,
      );
      deviceId = device.id;
    }
    const { token, tokenHash } = this.codeGenerator.generateSessionToken();
    const refresh = new RefreshToken();
    refresh.userId = user.id;
    refresh.deviceId = deviceId;
    refresh.tokenHash = tokenHash;
    refresh.expiresAt = new Date(
      Date.now() +
        this.config.get<number>('auth.refreshTokenTtlDays')! * 86_400_000,
    );
    const saved = await this.refreshTokens.save(refresh);
    const accessToken = this.jwtService.sign({
      sub: user.id,
      sid: saved.id,
      email: user.email,
      role: user.role,
    });
    return { user, accessToken, refreshToken: token };
  }
}
```

## 33. `register.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/register.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyRegisteredException } from '../../domain/exceptions/email-already-registered.exception';
import { InvalidReferralCodeException } from '../../domain/exceptions/invalid-referral-code.exception';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  DEVICE_REPOSITORY,
  IDeviceRepository,
} from '../../domain/repositories/device.repository.interface';
import { CodeGeneratorService } from '../../infrastructure/services/code-generator.service';
import { PasswordHasherService } from '../../infrastructure/services/password-hasher.service';
import { VerificationCodeService } from '../services/verification-code.service';

export interface RegisterCommand {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
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
    private readonly passwordHasher: PasswordHasherService,
    private readonly codeGenerator: CodeGeneratorService,
    private readonly verificationCode: VerificationCodeService,
  ) {}

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
    user.lastName = cmd.lastName?.trim() ?? null;
    user.phone = cmd.phone?.trim() ?? null;
    user.referredBy = referredBy;
    user.marketingOptIn = cmd.marketingOptIn ?? false;
    user.registeredIp = cmd.registeredIp;
    user.referralCode = await this.generateUniqueReferralCode();
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

  private async generateUniqueReferralCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = this.codeGenerator.generateReferralCode();
      if (!(await this.users.findByReferralCode(code))) return code;
    }
    throw new Error('Could not generate a unique referral code');
  }
}
```

## 34. `verify-email.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/verify-email.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import { InvalidAuthCodeException } from '../../domain/exceptions/invalid-auth-code.exception';
import {
  AUTH_TOKEN_REPOSITORY,
  IAuthTokenRepository,
} from '../../domain/repositories/auth-token.repository.interface';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { CodeGeneratorService } from '../../infrastructure/services/code-generator.service';
import { IssuedSession, SessionService } from '../services/session.service';

export interface VerifyEmailCommand {
  email: string;
  code: string;
  deviceFingerprint?: string;
  platform?: string;
}

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(AUTH_TOKEN_REPOSITORY)
    private readonly authTokens: IAuthTokenRepository,
    private readonly codeGenerator: CodeGeneratorService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(cmd: VerifyEmailCommand): Promise<IssuedSession> {
    const user = await this.users.findByEmail(cmd.email.trim().toLowerCase());
    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) {
      throw new InvalidAuthCodeException();
    }
    const token = await this.authTokens.findValidByHash(
      this.codeGenerator.hashToken(cmd.code),
      AuthTokenType.EMAIL_VERIFICATION,
    );
    if (
      !token ||
      token.userId !== user.id ||
      token.expiresAt.getTime() < Date.now()
    ) {
      throw new InvalidAuthCodeException();
    }
    await this.authTokens.consume(token.id);
    user.status = UserStatus.ACTIVE;
    user.emailVerifiedAt = new Date();
    const saved = await this.users.save(user);
    return this.sessionService.issue(
      saved,
      cmd.deviceFingerprint,
      cmd.platform,
    );
  }
}
```

## 35. `resend-verification.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/resend-verification.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { UserStatus } from '../../domain/enums/user-status.enum';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { VerificationCodeService } from '../services/verification-code.service';

export interface ResendVerificationCommand {
  email: string;
}

@Injectable()
export class ResendVerificationUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly verificationCode: VerificationCodeService,
  ) {}

  async execute(cmd: ResendVerificationCommand): Promise<void> {
    const user = await this.users.findByEmail(cmd.email.trim().toLowerCase());
    // Anti-enumeración: silencio total si no existe o ya está verificado
    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) return;
    await this.verificationCode.issue(user);
  }
}
```

## 36. `login.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/login.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { EmailNotVerifiedException } from '../../domain/exceptions/email-not-verified.exception';
import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';
import { UserSuspendedException } from '../../domain/exceptions/user-suspended.exception';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { PasswordHasherService } from '../../infrastructure/services/password-hasher.service';
import { IssuedSession, SessionService } from '../services/session.service';

export interface LoginCommand {
  email: string;
  password: string;
  deviceFingerprint?: string;
  platform?: string;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(cmd: LoginCommand): Promise<IssuedSession> {
    const user = await this.users.findByEmail(cmd.email.trim().toLowerCase());
    // Mismo 401 para email inexistente, cuenta solo-Google y password errado
    if (!user || !user.passwordHash) throw new InvalidCredentialsException();
    const valid = await this.passwordHasher.verify(
      user.passwordHash,
      cmd.password,
    );
    if (!valid) throw new InvalidCredentialsException();
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new EmailNotVerifiedException();
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UserSuspendedException();
    }
    return this.sessionService.issue(
      user,
      cmd.deviceFingerprint,
      cmd.platform,
    );
  }
}
```

## 37. `refresh.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/refresh.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { CompromisedSessionException } from '../../domain/exceptions/compromised-session.exception';
import { InvalidRefreshTokenException } from '../../domain/exceptions/invalid-refresh-token.exception';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { CodeGeneratorService } from '../../infrastructure/services/code-generator.service';
import { IssuedTokens } from '../mappers/auth.mapper';

export interface RefreshCommand {
  refreshToken: string;
}

@Injectable()
export class RefreshUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: IRefreshTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly codeGenerator: CodeGeneratorService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async execute(cmd: RefreshCommand): Promise<IssuedTokens> {
    const existing = await this.refreshTokens.findByTokenHash(
      this.codeGenerator.hashToken(cmd.refreshToken),
    );
    if (!existing) throw new InvalidRefreshTokenException();
    if (existing.revokedAt) {
      // Reuso de token ya rotado = posible robo → matar todas las sesiones
      await this.refreshTokens.revokeAllForUser(existing.userId);
      throw new CompromisedSessionException();
    }
    if (existing.expiresAt.getTime() < Date.now()) {
      throw new InvalidRefreshTokenException();
    }
    const user = await this.users.findById(existing.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new InvalidRefreshTokenException();
    }

    await this.refreshTokens.revoke(existing.id);
    const { token, tokenHash } = this.codeGenerator.generateSessionToken();
    const next = new RefreshToken();
    next.userId = user.id;
    next.deviceId = existing.deviceId;
    next.tokenHash = tokenHash;
    next.expiresAt = new Date(
      Date.now() +
        this.config.get<number>('auth.refreshTokenTtlDays')! * 86_400_000,
    );
    const saved = await this.refreshTokens.save(next);
    const accessToken = this.jwtService.sign({
      sub: user.id,
      sid: saved.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken, refreshToken: token };
  }
}
```

## 38. `logout.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/logout.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  IRefreshTokenRepository,
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
```

## 39. `get-me.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/get-me.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { SessionNotFoundException } from '../../domain/exceptions/session-not-found.exception';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  IUserRepository,
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
```

## 40. Migración `CreateAuthTables` (archivo nuevo)

**Ruta:** `src/infrastructure/database/migrations/<timestamp>-CreateAuthTables.ts`

Crear el archivo vacío con `npm run migration:create src/infrastructure/database/migrations/CreateAuthTables` (el timestamp lo pone el CLI) y volcar este contenido:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthTables<TIMESTAMP> implements MigrationInterface {
  name = 'CreateAuthTables<TIMESTAMP>';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);
    await queryRunner.query(
      `CREATE TYPE "user_role" AS ENUM ('customer', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TYPE "user_status" AS ENUM ('pending_verification', 'active', 'suspended')`,
    );
    await queryRunner.query(
      `CREATE TYPE "auth_token_type" AS ENUM ('email_verification', 'password_reset')`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" citext NOT NULL,
        "password_hash" varchar(255),
        "google_id" varchar(255),
        "role" "user_role" NOT NULL DEFAULT 'customer',
        "status" "user_status" NOT NULL DEFAULT 'pending_verification',
        "email_verified_at" timestamptz,
        "first_name" varchar(100) NOT NULL,
        "last_name" varchar(100),
        "phone" varchar(20),
        "registered_ip" inet,
        "referral_code" varchar(20) NOT NULL,
        "referred_by" uuid REFERENCES "users"("id"),
        "marketing_opt_in" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "uq_users_email" UNIQUE ("email"),
        CONSTRAINT "uq_users_google_id" UNIQUE ("google_id"),
        CONSTRAINT "uq_users_referral_code" UNIQUE ("referral_code")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_users_status" ON "users" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_users_referred_by" ON "users" ("referred_by")`,
    );

    await queryRunner.query(`
      CREATE TABLE "addresses" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "label" varchar(50) NOT NULL,
        "address_line" varchar(255) NOT NULL,
        "reference" text,
        "latitude" numeric(9,6),
        "longitude" numeric(9,6),
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_addresses_user_id" ON "addresses" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_addresses_default" ON "addresses" ("user_id") WHERE "is_default"`,
    );

    await queryRunner.query(`
      CREATE TABLE "devices" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "fingerprint" varchar(255) NOT NULL,
        "platform" varchar(20),
        "push_token" varchar(255),
        "notifications_enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_seen_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_devices_user_fingerprint" UNIQUE ("user_id", "fingerprint")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_devices_fingerprint" ON "devices" ("fingerprint")`,
    );

    await queryRunner.query(`
      CREATE TABLE "auth_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" varchar(255) NOT NULL,
        "type" "auth_token_type" NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_auth_tokens_token_hash" ON "auth_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_auth_tokens_user_type" ON "auth_tokens" ("user_id", "type")`,
    );

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "device_id" uuid REFERENCES "devices"("id") ON DELETE SET NULL,
        "token_hash" varchar(255) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_refresh_tokens_token_hash" UNIQUE ("token_hash")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_device_id" ON "refresh_tokens" ("device_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "auth_tokens"`);
    await queryRunner.query(`DROP TABLE "devices"`);
    await queryRunner.query(`DROP TABLE "addresses"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "auth_token_type"`);
    await queryRunner.query(`DROP TYPE "user_status"`);
    await queryRunner.query(`DROP TYPE "user_role"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS citext`);
  }
}
```

## 41. `user.schema.ts` (archivo nuevo)

**Ruta:** `src/infrastructure/database/schemas/user.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { User } from '../../../modules/auth/domain/entities/user.entity';
import { UserRole } from '../../../modules/auth/domain/enums/user-role.enum';
import { UserStatus } from '../../../modules/auth/domain/enums/user-status.enum';

export const UserSchema = new EntitySchema<User>({
  name: 'User',
  target: User,
  tableName: 'users',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    email: { type: 'varchar', length: 255 },
    passwordHash: {
      name: 'password_hash',
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    googleId: {
      name: 'google_id',
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    role: {
      type: 'enum',
      enum: UserRole,
      enumName: 'user_role',
      default: UserRole.CUSTOMER,
    },
    status: {
      type: 'enum',
      enum: UserStatus,
      enumName: 'user_status',
      default: UserStatus.PENDING_VERIFICATION,
    },
    emailVerifiedAt: {
      name: 'email_verified_at',
      type: 'timestamptz',
      nullable: true,
    },
    firstName: { name: 'first_name', type: 'varchar', length: 100 },
    lastName: {
      name: 'last_name',
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    phone: { type: 'varchar', length: 20, nullable: true },
    registeredIp: {
      name: 'registered_ip',
      type: 'varchar',
      length: 39,
      nullable: true,
    },
    referralCode: { name: 'referral_code', type: 'varchar', length: 20 },
    referredBy: { name: 'referred_by', type: 'uuid', nullable: true },
    marketingOptIn: {
      name: 'marketing_opt_in',
      type: 'boolean',
      default: false,
    },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
    deletedAt: {
      name: 'deleted_at',
      type: 'timestamptz',
      nullable: true,
      deleteDate: true,
    },
  },
});
```

## 42. `address.schema.ts` (archivo nuevo)

**Ruta:** `src/infrastructure/database/schemas/address.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { Address } from '../../../modules/auth/domain/entities/address.entity';

export const AddressSchema = new EntitySchema<Address>({
  name: 'Address',
  target: Address,
  tableName: 'addresses',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    userId: { name: 'user_id', type: 'uuid' },
    label: { type: 'varchar', length: 50 },
    addressLine: { name: 'address_line', type: 'varchar', length: 255 },
    reference: { type: 'text', nullable: true },
    latitude: { type: 'numeric', precision: 9, scale: 6, nullable: true },
    longitude: { type: 'numeric', precision: 9, scale: 6, nullable: true },
    isDefault: { name: 'is_default', type: 'boolean', default: false },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
```

## 43. `device.schema.ts` (archivo nuevo)

**Ruta:** `src/infrastructure/database/schemas/device.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { Device } from '../../../modules/auth/domain/entities/device.entity';

export const DeviceSchema = new EntitySchema<Device>({
  name: 'Device',
  target: Device,
  tableName: 'devices',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    userId: { name: 'user_id', type: 'uuid' },
    fingerprint: { type: 'varchar', length: 255 },
    platform: { type: 'varchar', length: 20, nullable: true },
    pushToken: { name: 'push_token', type: 'varchar', length: 255, nullable: true },
    notificationsEnabled: {
      name: 'notifications_enabled',
      type: 'boolean',
      default: true,
    },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    lastSeenAt: { name: 'last_seen_at', type: 'timestamptz' },
  },
});
```

## 44. `auth-token.schema.ts` (archivo nuevo)

**Ruta:** `src/infrastructure/database/schemas/auth-token.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { AuthToken } from '../../../modules/auth/domain/entities/auth-token.entity';
import { AuthTokenType } from '../../../modules/auth/domain/enums/auth-token-type.enum';

export const AuthTokenSchema = new EntitySchema<AuthToken>({
  name: 'AuthToken',
  target: AuthToken,
  tableName: 'auth_tokens',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    userId: { name: 'user_id', type: 'uuid' },
    tokenHash: { name: 'token_hash', type: 'varchar', length: 255 },
    type: { type: 'enum', enum: AuthTokenType, enumName: 'auth_token_type' },
    expiresAt: { name: 'expires_at', type: 'timestamptz' },
    consumedAt: { name: 'consumed_at', type: 'timestamptz', nullable: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
  },
});
```

## 45. `refresh-token.schema.ts` (archivo nuevo)

**Ruta:** `src/infrastructure/database/schemas/refresh-token.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { RefreshToken } from '../../../modules/auth/domain/entities/refresh-token.entity';

export const RefreshTokenSchema = new EntitySchema<RefreshToken>({
  name: 'RefreshToken',
  target: RefreshToken,
  tableName: 'refresh_tokens',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    userId: { name: 'user_id', type: 'uuid' },
    deviceId: { name: 'device_id', type: 'uuid', nullable: true },
    tokenHash: { name: 'token_hash', type: 'varchar', length: 255 },
    expiresAt: { name: 'expires_at', type: 'timestamptz' },
    revokedAt: { name: 'revoked_at', type: 'timestamptz', nullable: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
  },
});
```

## 46. `user.repository.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/repositories/user.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyRegisteredException } from '../../domain/exceptions/email-already-registered.exception';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';

interface PgDriverError {
  code?: string;
  constraint?: string;
}

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @InjectRepository(User) private readonly orm: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.orm.findOne({ where: { id, deletedAt: IsNull() } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.orm.findOne({
      where: { email: email.toLowerCase(), deletedAt: IsNull() },
    });
  }

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.orm.findOne({ where: { googleId, deletedAt: IsNull() } });
  }

  findByReferralCode(code: string): Promise<User | null> {
    return this.orm.findOne({
      where: { referralCode: code, deletedAt: IsNull() },
    });
  }

  async save(user: User): Promise<User> {
    try {
      return await this.orm.save(user);
    } catch (error) {
      const driverError =
        error instanceof QueryFailedError
          ? (error as { driverError: PgDriverError }).driverError
          : undefined;
      if (
        driverError?.code === '23505' &&
        driverError.constraint === 'uq_users_email'
      ) {
        throw new EmailAlreadyRegisteredException();
      }
      throw error;
    }
  }
}
```

## 47. `device.repository.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/repositories/device.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Device } from '../../domain/entities/device.entity';
import { IDeviceRepository } from '../../domain/repositories/device.repository.interface';

@Injectable()
export class DeviceRepository implements IDeviceRepository {
  constructor(
    @InjectRepository(Device) private readonly orm: Repository<Device>,
  ) {}

  findByUserAndFingerprint(
    userId: string,
    fingerprint: string,
  ): Promise<Device | null> {
    return this.orm.findOne({ where: { userId, fingerprint } });
  }

  async touch(
    userId: string,
    fingerprint: string,
    platform: string | null,
  ): Promise<Device> {
    const existing = await this.findByUserAndFingerprint(userId, fingerprint);
    if (existing) {
      existing.lastSeenAt = new Date();
      if (platform) existing.platform = platform;
      return this.orm.save(existing);
    }
    const device = new Device();
    device.userId = userId;
    device.fingerprint = fingerprint;
    device.platform = platform;
    device.lastSeenAt = new Date();
    try {
      return await this.orm.save(device);
    } catch (error) {
      // Carrera en el UNIQUE (user_id, fingerprint): gana quien insertó primero
      if (error instanceof QueryFailedError) {
        const winner = await this.findByUserAndFingerprint(
          userId,
          fingerprint,
        );
        if (winner) return winner;
      }
      throw error;
    }
  }
}
```

## 48. `auth-token.repository.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/repositories/auth-token.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuthToken } from '../../domain/entities/auth-token.entity';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import { IAuthTokenRepository } from '../../domain/repositories/auth-token.repository.interface';

@Injectable()
export class AuthTokenRepository implements IAuthTokenRepository {
  constructor(
    @InjectRepository(AuthToken) private readonly orm: Repository<AuthToken>,
  ) {}

  save(token: AuthToken): Promise<AuthToken> {
    return this.orm.save(token);
  }

  findValidByHash(
    tokenHash: string,
    type: AuthTokenType,
  ): Promise<AuthToken | null> {
    return this.orm.findOne({
      where: { tokenHash, type, consumedAt: IsNull() },
    });
  }

  async consume(id: string): Promise<void> {
    await this.orm.update({ id, consumedAt: IsNull() }, {
      consumedAt: new Date(),
    });
  }

  async consumePendingForUser(
    userId: string,
    type: AuthTokenType,
  ): Promise<void> {
    await this.orm.update(
      { userId, type, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
  }
}
```

## 49. `refresh-token.repository.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/repositories/refresh-token.repository.ts`

```typescript
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

  async revoke(id: string): Promise<void> {
    await this.orm.update({ id, revokedAt: IsNull() }, {
      revokedAt: new Date(),
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.orm.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
```

## 50. `password-hasher.service.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/services/password-hasher.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

@Injectable()
export class PasswordHasherService {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plain, hash);
    } catch {
      return false;
    }
  }
}
```

## 51. `code-generator.service.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/services/code-generator.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'crypto';

const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERRAL_LENGTH = 8;

@Injectable()
export class CodeGeneratorService {
  generateVerificationCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  generateSessionToken(): { token: string; tokenHash: string } {
    const token = randomBytes(48).toString('base64url');
    return { token, tokenHash: this.hashToken(token) };
  }

  generateReferralCode(): string {
    let code = '';
    for (let i = 0; i < REFERRAL_LENGTH; i++) {
      code += REFERRAL_ALPHABET[randomInt(0, REFERRAL_ALPHABET.length)];
    }
    return code;
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
```

## 52. `email-sender.service.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/services/email-sender.service.ts`

Envío real vía **Resend API** (`fetch` nativo — sin dependencia nueva). Si `RESEND_API_KEY` no está configurada, cae al fallback de dev: loguea el código (los e2e lo capturan por spy y nunca pegan a la API — ver `pendientes/002-envio-email-real.md` para la verificación de dominio).

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../../common/logger/logger.service';

interface ResendResponse {
  id?: string;
  message?: string;
}

@Injectable()
export class EmailSenderService {
  constructor(
    private readonly logger: LoggerService,
    private readonly config: ConfigService,
  ) {}

  async sendVerificationCode(email: string, code: string): Promise<void> {
    await this.send(
      email,
      'Your PCalientes verification code',
      `<p>Your verification code is <strong>${code}</strong>. It expires in 15 minutes.</p>`,
      () => this.logCode('verification', email, code),
    );
  }

  async sendPasswordResetCode(email: string, code: string): Promise<void> {
    await this.send(
      email,
      'Your PCalientes password reset code',
      `<p>Your password reset code is <strong>${code}</strong>. It expires in 15 minutes.</p>`,
      () => this.logCode('password reset', email, code),
    );
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    fallback: () => void,
  ): Promise<void> {
    const apiKey = this.config.get<string>('email.resendApiKey');
    if (!apiKey) {
      // Sin API key: fallback dev — el código queda en el log
      fallback();
      return;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.get<string>('email.from')!,
        to,
        subject,
        html,
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ResendResponse;
      this.logger.error(
        `Resend failed (${response.status}): ${body.message ?? 'unknown'}`,
        undefined,
        'EmailSenderService',
      );
      throw new Error(`Email delivery failed: ${response.status}`);
    }
  }

  private logCode(kind: string, email: string, code: string): void {
    this.logger.warn(
      `RESEND_API_KEY missing — ${kind} code for ${email}: ${code}`,
      'EmailSenderService',
    );
  }
}
```

## 53. `jwt.strategy.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/strategies/jwt.strategy.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  sid: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.jwtSecret')!,
    });
  }

  validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      sessionId: payload.sid,
      email: payload.email,
      role: payload.role,
    };
  }
}
```

## 54. `jwt-auth.guard.ts` (archivo nuevo)

**Ruta:** `src/common/guards/jwt-auth.guard.ts`

```typescript
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

## 55. `roles.guard.ts` (archivo nuevo)

**Ruta:** `src/common/guards/roles.guard.ts`

Guard opt-in por ruta (nunca global — ver skill `code-patterns`). Queda listo para los endpoints admin de próximas propuestas; ningún endpoint de esta propuesta lo usa todavía.

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role?: string } }>();
    return !!user?.role && roles.includes(user.role);
  }
}
```

## 56. `auth.config.ts` y `email.config.ts` (archivos nuevos)

**Ruta:** `src/config/auth.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET,
  accessTokenTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  refreshTokenTtlDays: parseInt(process.env.JWT_REFRESH_TTL_DAYS ?? '30', 10),
  codeTtlMinutes: parseInt(process.env.AUTH_CODE_TTL_MINUTES ?? '15', 10),
  googleClientIds: (process.env.GOOGLE_CLIENT_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
}));
```

**Ruta:** `src/config/email.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('email', () => ({
  resendApiKey: process.env.RESEND_API_KEY || null,
  from: process.env.EMAIL_FROM ?? 'PCalientes <onboarding@resend.dev>',
}));
```

## 57. `auth.module.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/auth.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressSchema } from '../../infrastructure/database/schemas/address.schema';
import { AuthTokenSchema } from '../../infrastructure/database/schemas/auth-token.schema';
import { DeviceSchema } from '../../infrastructure/database/schemas/device.schema';
import { RefreshTokenSchema } from '../../infrastructure/database/schemas/refresh-token.schema';
import { UserSchema } from '../../infrastructure/database/schemas/user.schema';
import { LoggerModule } from '../../common/logger/logger.module';
import { AuthController } from './presentation/controllers/auth.controller';
import { AuthMapper } from './application/mappers/auth.mapper';
import { AuthService } from './application/services/auth.service';
import { SessionService } from './application/services/session.service';
import { VerificationCodeService } from './application/services/verification-code.service';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RefreshUseCase } from './application/use-cases/refresh.use-case';
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { ResendVerificationUseCase } from './application/use-cases/resend-verification.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
import { AUTH_TOKEN_REPOSITORY } from './domain/repositories/auth-token.repository.interface';
import { DEVICE_REPOSITORY } from './domain/repositories/device.repository.interface';
import { REFRESH_TOKEN_REPOSITORY } from './domain/repositories/refresh-token.repository.interface';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { AuthTokenRepository } from './infrastructure/repositories/auth-token.repository';
import { DeviceRepository } from './infrastructure/repositories/device.repository';
import { RefreshTokenRepository } from './infrastructure/repositories/refresh-token.repository';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { CodeGeneratorService } from './infrastructure/services/code-generator.service';
import { EmailSenderService } from './infrastructure/services/email-sender.service';
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
        signOptions: { expiresIn: config.get<string>('auth.accessTokenTtl')! },
      }),
    }),
    LoggerModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthMapper,
    SessionService,
    VerificationCodeService,
    RegisterUseCase,
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
    PasswordHasherService,
    CodeGeneratorService,
    EmailSenderService,
    JwtStrategy,
  ],
})
export class AuthModule {}
```

Nota: el módulo **no exporta nada** todavía — cuando otro módulo (`orders`) necesite el repo de usuarios se decide la forma según la regla del segundo consumidor.

## 58. `env.validation.ts` (archivo existente — actualización)

**Ruta:** `src/config/env.validation.ts`

Agregar a `EnvironmentVariables` (después de `DB_SYNCHRONIZE`):

```typescript
  @IsString()
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_TTL?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  JWT_REFRESH_TTL_DAYS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_CODE_TTL_MINUTES?: number;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_IDS?: string;

  @IsOptional()
  @IsString()
  RESEND_API_KEY?: string;

  @IsOptional()
  @IsString()
  EMAIL_FROM?: string;
```

## 59. `app.module.ts` (archivo existente — actualización)

**Ruta:** `src/app.module.ts`

**Antes (imports y providers relevantes):**

```typescript
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import loggerConfig from './config/logger.config';
import throttleConfig from './config/throttle.config';
```

**Después:**

```typescript
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import emailConfig from './config/email.config';
import loggerConfig from './config/logger.config';
import throttleConfig from './config/throttle.config';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
```

**Antes:**

```typescript
      load: [appConfig, databaseConfig, throttleConfig, loggerConfig],
```

**Después:**

```typescript
      load: [
        appConfig,
        authConfig,
        databaseConfig,
        emailConfig,
        throttleConfig,
        loggerConfig,
      ],
```

**Antes:**

```typescript
    LoggerModule,
    DatabaseModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
```

**Después:**

```typescript
    LoggerModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
  ],
  providers: [
```

**Antes:**

```typescript
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
```

**Después:**

```typescript
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
```

Eliminar también los imports `AppController`/`AppService` (los archivos se borran en el paso 65).

## 60. `health.controller.ts` (archivo existente — actualización)

**Ruta:** `src/infrastructure/health/health.controller.ts`

Con `JwtAuthGuard` global, `/health` debe ser público:

**Antes:**

```typescript
import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SkipThrottle } from '../../common/decorators/skip-throttle.decorator';
```

**Después:**

```typescript
import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';
import { SkipThrottle } from '../../common/decorators/skip-throttle.decorator';
```

**Antes:**

```typescript
  @Get()
  @SkipThrottle()
  async check() {
```

**Después:**

```typescript
  @Get()
  @Public()
  @SkipThrottle()
  async check() {
```

## 61. `.env.example` (archivo existente — actualización)

**Ruta:** `.env.example`

Agregar al final:

```bash
# Auth/JWT — JWT_SECRET: generar con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
# NUNCA reusar el mismo secret entre entornos (env-secrets)
JWT_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=30

# TTL del código de verificación/reset (minutos)
AUTH_CODE_TTL_MINUTES=15

# Google Sign-In — client IDs separados por coma (Android/iOS/web, consola de Google Cloud)
# Se usa en la propuesta 003; vacío = endpoint /auth/google no disponible
GOOGLE_CLIENT_IDS=

# Email (Resend — https://resend.com): API key del dashboard.
# Vacío = el servicio NO envía y loguea el código (fallback dev).
# EMAIL_FROM: remitente verificado en Resend — con dominio sin verificar solo
# sirve 'onboarding@resend.dev' hacia el email de la propia cuenta.
RESEND_API_KEY=
EMAIL_FROM=PCalientes <onboarding@resend.dev>
```

## 62. `.env` (archivo existente — actualización, gitignored)

**Ruta:** `.env`

Agregar (generar el secret con el comando documentado arriba — valor único para dev):

```bash
JWT_SECRET=<generado-localmente>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=30
AUTH_CODE_TTL_MINUTES=15
GOOGLE_CLIENT_IDS=
RESEND_API_KEY=
EMAIL_FROM=PCalientes <onboarding@resend.dev>
```

## 63. `.env.test` (archivo existente — actualización, gitignored)

**Ruta:** `.env.test`

Agregar (secret distinto al de dev):

```bash
JWT_SECRET=<generado-localmente-distinto>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=30
AUTH_CODE_TTL_MINUTES=15
GOOGLE_CLIENT_IDS=
RESEND_API_KEY=
EMAIL_FROM=PCalientes <onboarding@resend.dev>
```

## 64. `package.json` (archivo existente — actualización)

**Ruta:** `package.json`

Instalar con npm (nunca editar la lista a mano):

```powershell
npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt
npm install -D @types/passport-jwt @types/passport @types/bcrypt
```

Actualizar `jest.collectCoverageFrom` para que el coverage no cuente wiring/DTOs (ver `unit-test-checklist`):

**Antes:**

```json
    "collectCoverageFrom": [
      "**/*.(t|j)s"
    ],
```

**Después:**

```json
    "collectCoverageFrom": [
      "**/*.(t|j)s",
      "!**/*.module.ts",
      "!**/main.ts",
      "!**/*.schema.ts",
      "!**/migrations/**",
      "!**/*.dto.ts",
      "!**/*.exception.ts",
      "!**/*.enum.ts",
      "!**/*.interface.ts",
      "!**/*.decorator.ts",
      "!**/*.config.ts"
    ],
```

## 65. Archivos eliminados

Borrar (scaffold sin uso; `test/app.e2e-spec.ts` probaba `GET /` que deja de existir):

- `src/app.controller.ts`
- `src/app.service.ts`
- `src/app.controller.spec.ts`
- `test/app.e2e-spec.ts`

## 66. `e2e-app.ts` (archivo existente — actualización)

**Ruta:** `test/support/e2e-app.ts`

El bootstrap crece con spy de email, limpieza de tablas y helpers de auth. Reemplazar el archivo completo:

```typescript
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { EmailSenderService } from '../../src/modules/auth/infrastructure/services/email-sender.service';

let throttlerGuardSpy: jest.SpyInstance;

export type SentEmailKind = 'verification' | 'password_reset';

const sentEmails: { kind: SentEmailKind; email: string; code: string }[] = [];

export async function createE2EApp(): Promise<INestApplication> {
  jest.restoreAllMocks();
  throttlerGuardSpy = jest
    .spyOn(ThrottlerGuard.prototype, 'canActivate')
    .mockResolvedValue(true);
  jest
    .spyOn(EmailSenderService.prototype, 'sendVerificationCode')
    .mockImplementation((email: string, code: string) => {
      sentEmails.push({ kind: 'verification', email, code });
      return Promise.resolve();
    });
  jest
    .spyOn(EmailSenderService.prototype, 'sendPasswordResetCode')
    .mockImplementation((email: string, code: string) => {
      sentEmails.push({ kind: 'password_reset', email, code });
      return Promise.resolve();
    });

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  // El pipe global vive en main.ts — los e2e no pasan por ahí, se aplica acá
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  return app;
}

export function restoreThrottler(): void {
  throttlerGuardSpy?.mockRestore();
}

export function lastCodeFor(
  email: string,
  kind: SentEmailKind = 'verification',
): string {
  const found = [...sentEmails]
    .reverse()
    .find((e) => e.email === email && e.kind === kind);
  if (!found) throw new Error(`No ${kind} email captured for ${email}`);
  return found.code;
}

export async function cleanAuthTables(app: INestApplication): Promise<void> {
  const ds = app.get(DataSource);
  await ds.query(
    'TRUNCATE refresh_tokens, auth_tokens, devices, addresses, users RESTART IDENTITY CASCADE',
  );
  sentEmails.length = 0;
}

export interface RegisterBody {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  referralCode?: string;
  marketingOptIn?: boolean;
  deviceFingerprint?: string;
  platform?: string;
}

export async function registerUser(
  app: INestApplication,
  overrides: Partial<RegisterBody> = {},
): Promise<RegisterBody> {
  const body: RegisterBody = {
    email: 'user@test.com',
    password: 'Password1!',
    firstName: 'Test',
    ...overrides,
  };
  await request(app.getHttpServer() as App)
    .post('/auth/register')
    .send(body)
    .expect(201);
  return body;
}

export async function activateAndGetTokens(
  app: INestApplication,
  email: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const code = lastCodeFor(email);
  const res = await request(app.getHttpServer() as App)
    .post('/auth/verify-email')
    .send({ email, code })
    .expect(200);
  return res.body as { accessToken: string; refreshToken: string };
}
```

## 67. `register.e2e-spec.ts` (archivo nuevo)

**Ruta:** `test/auth/register.e2e-spec.ts`

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  cleanAuthTables,
  createE2EApp,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('POST /auth/register (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('registra un usuario pendiente de verificación', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({
        email: 'Nuevo@Test.com',
        password: 'Password1!',
        firstName: 'Nuevo',
        lastName: 'Cliente',
      })
      .expect(201);

    const body = res.body as Record<string, unknown>;
    expect(body.email).toBe('nuevo@test.com');
    expect(body.status).toBe('pending_verification');
    expect(body.role).toBe('customer');
    expect(typeof body.referralCode).toBe('string');
    expect((body.referralCode as string).length).toBe(8);
    expect(body.accessToken).toBeUndefined();
    expect(body.passwordHash).toBeUndefined();
  });

  it('rechaza email inválido', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({ email: 'no-es-email', password: 'Password1!', firstName: 'X' })
      .expect(400);
  });

  it('rechaza password corto', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({ email: 'a@b.com', password: 'short', firstName: 'X' })
      .expect(400);
  });

  it('rechaza campos no permitidos (mass-assignment role)', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({
        email: 'a@b.com',
        password: 'Password1!',
        firstName: 'X',
        role: 'admin',
      })
      .expect(400);
    expect((res.body as { message: string[] }).message.join()).toContain(
      'role',
    );
  });

  it('rechaza email duplicado aunque cambie el case', async () => {
    await registerUser(app, { email: 'dupe@test.com' });
    const res = await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({
        email: 'DUPE@test.com',
        password: 'Password1!',
        firstName: 'Otro',
      })
      .expect(409);
    expect((res.body as { message: string }).message).toBe(
      'Email is already registered',
    );
  });

  it('rechaza referralCode inexistente', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({
        email: 'a@b.com',
        password: 'Password1!',
        firstName: 'X',
        referralCode: 'NOEXISTE1',
      })
      .expect(400);
  });

  it('guarda referred_by cuando el código es válido', async () => {
    await registerUser(app, { email: 'ref@test.com' });
    const referrer = (
      await app
        .get(DataSource)
        .query<{ id: string; referral_code: string }[]>(
          'SELECT id, referral_code FROM users WHERE email = $1',
          ['ref@test.com'],
        )
    )[0];

    await request(app.getHttpServer() as App)
      .post('/auth/register')
      .send({
        email: 'ref2@test.com',
        password: 'Password1!',
        firstName: 'Y',
        referralCode: referrer.referral_code,
      })
      .expect(201);

    const rows = await app
      .get(DataSource)
      .query<{ referred_by: string }[]>(
        'SELECT referred_by FROM users WHERE email = $1',
        ['ref2@test.com'],
      );
    expect(rows[0].referred_by).toBe(referrer.id);
  });
});

## 68. `verify-email.e2e-spec.ts` (archivo nuevo)

**Ruta:** `test/auth/verify-email.e2e-spec.ts`

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  cleanAuthTables,
  createE2EApp,
  lastCodeFor,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('POST /auth/verify-email (e2e)', () => {
  let app: INestApplication;
  const email = 'verify@test.com';

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
    await registerUser(app, { email });
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('verifica el email y devuelve sesión completa', async () => {
    const code = lastCodeFor(email);
    const res = await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code })
      .expect(200);

    const body = res.body as {
      accessToken: string;
      refreshToken: string;
      user: { status: string; emailVerifiedAt: string | null };
    };
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.status).toBe('active');
    expect(body.user.emailVerifiedAt).toBeTruthy();
  });

  it('el código queda consumido (single-use)', async () => {
    const code = lastCodeFor(email);
    await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code })
      .expect(200);
    await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code })
      .expect(400);
  });

  it('rechaza código incorrecto', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code: '000000' })
      .expect(400);
    expect((res.body as { message: string }).message).toBe(
      'Invalid or expired code',
    );
  });

  it('rechaza el código de otro usuario', async () => {
    await registerUser(app, { email: 'other@test.com' });
    const codeOfOther = lastCodeFor('other@test.com');
    await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code: codeOfOther })
      .expect(400);
  });

  it('rechaza email inexistente con el mismo mensaje', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email: 'ghost@test.com', code: '123456' })
      .expect(400);
    expect((res.body as { message: string }).message).toBe(
      'Invalid or expired code',
    );
  });

  it('rechaza código expirado', async () => {
    const code = lastCodeFor(email);
    await app
      .get(DataSource)
      .query(
        `UPDATE auth_tokens SET expires_at = now() - interval '1 minute'`,
      );
    await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code })
      .expect(400);
  });

  it('rechaza formato de código inválido', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code: 'abcdef' })
      .expect(400);
  });
});
```

## 69. `resend-verification.e2e-spec.ts` (archivo nuevo)

**Ruta:** `test/auth/resend-verification.e2e-spec.ts`

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

const GENERIC_MESSAGE =
  'If that email is registered and unverified, a new code has been sent.';

describe('POST /auth/resend-verification (e2e)', () => {
  let app: INestApplication;
  const email = 'resend@test.com';

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
    await registerUser(app, { email });
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('emite un código nuevo e invalida el anterior', async () => {
    const firstCode = lastCodeFor(email);
    const res = await request(app.getHttpServer() as App)
      .post('/auth/resend-verification')
      .send({ email })
      .expect(200);
    expect((res.body as { message: string }).message).toBe(GENERIC_MESSAGE);

    const secondCode = lastCodeFor(email);
    expect(secondCode).not.toBe(firstCode);

    await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code: firstCode })
      .expect(400);
    await request(app.getHttpServer() as App)
      .post('/auth/verify-email')
      .send({ email, code: secondCode })
      .expect(200);
  });

  it('responde lo mismo para email inexistente (anti-enumeración)', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/resend-verification')
      .send({ email: 'ghost@test.com' })
      .expect(200);
    expect((res.body as { message: string }).message).toBe(GENERIC_MESSAGE);
  });

  it('responde lo mismo para un usuario ya verificado', async () => {
    await activateAndGetTokens(app, email);
    const res = await request(app.getHttpServer() as App)
      .post('/auth/resend-verification')
      .send({ email })
      .expect(200);
    expect((res.body as { message: string }).message).toBe(GENERIC_MESSAGE);
  });
});
```

## 70. `login.e2e-spec.ts` (archivo nuevo)

**Ruta:** `test/auth/login.e2e-spec.ts`

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  activateAndGetTokens,
  cleanAuthTables,
  createE2EApp,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('POST /auth/login (e2e)', () => {
  let app: INestApplication;
  const email = 'login@test.com';
  const password = 'Password1!';

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('devuelve tokens y perfil con credenciales válidas', async () => {
    await registerUser(app, { email, password });
    await activateAndGetTokens(app, email);

    const res = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    const body = res.body as {
      accessToken: string;
      refreshToken: string;
      user: { email: string; status: string };
    };
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.email).toBe(email);
    expect(body.user.status).toBe('active');
  });

  it('mismo 401 para password errado y email inexistente', async () => {
    await registerUser(app, { email, password });
    await activateAndGetTokens(app, email);

    const wrongPass = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email, password: 'WrongPass1' })
      .expect(401);
    const unknownEmail = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email: 'ghost@test.com', password })
      .expect(401);

    expect((wrongPass.body as { message: string }).message).toBe(
      'Invalid credentials',
    );
    expect((unknownEmail.body as { message: string }).message).toBe(
      'Invalid credentials',
    );
  });

  it('rechaza login sin email verificado', async () => {
    await registerUser(app, { email, password });
    const res = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email, password })
      .expect(403);
    expect((res.body as { message: string }).message).toBe(
      'Email is not verified',
    );
  });

  it('registra el dispositivo cuando llega fingerprint', async () => {
    await registerUser(app, { email, password });
    await activateAndGetTokens(app, email);

    await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({
        email,
        password,
        deviceFingerprint: 'fp-android-1',
        platform: 'android',
      })
      .expect(200);

    const devices = await app
      .get(DataSource)
      .query<{ fingerprint: string; platform: string }[]>(
        'SELECT fingerprint, platform FROM devices',
      );
    expect(devices).toHaveLength(1);
    expect(devices[0].fingerprint).toBe('fp-android-1');
    expect(devices[0].platform).toBe('android');
  });
});
```

## 71. `refresh.e2e-spec.ts` (archivo nuevo)

**Ruta:** `test/auth/refresh.e2e-spec.ts`

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  activateAndGetTokens,
  cleanAuthTables,
  createE2EApp,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('POST /auth/refresh (e2e)', () => {
  let app: INestApplication;
  const email = 'refresh@test.com';

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
    await registerUser(app, { email });
    await activateAndGetTokens(app, email);
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  async function login(): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const res = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ email, password: 'Password1!' })
      .expect(200);
    return res.body as { accessToken: string; refreshToken: string };
  }

  it('rota el refresh token y emite un access nuevo', async () => {
    const { refreshToken } = await login();
    const res = await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    const body = res.body as { accessToken: string; refreshToken: string };
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.refreshToken).not.toBe(refreshToken);

    // El token rotado ya no sirve
    await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('reuso de token revocado revoca todas las sesiones', async () => {
    const first = await login();
    const second = await login();

    // Rotar la primera sesión → first.refreshToken queda revocado
    const rotated = await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);

    // Reuso del revocado → sesión comprometida → revoca todo
    await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);

    // La segunda sesión también murió
    await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken: second.refreshToken })
      .expect(401);

    // Y el token recién rotado también
    const rotatedBody = rotated.body as { refreshToken: string };
    await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken: rotatedBody.refreshToken })
      .expect(401);
  });

  it('rechaza token inexistente', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken: 'token-inventado' })
      .expect(401);
  });

  it('rechaza body sin refreshToken', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({})
      .expect(400);
  });
});
```

## 72. `logout.e2e-spec.ts` (archivo nuevo)

**Ruta:** `test/auth/logout.e2e-spec.ts`

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  activateAndGetTokens,
  cleanAuthTables,
  createE2EApp,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('POST /auth/logout (e2e)', () => {
  let app: INestApplication;
  const email = 'logout@test.com';
  let tokens: { accessToken: string; refreshToken: string };

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
    await registerUser(app, { email });
    tokens = await activateAndGetTokens(app, email);
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('revoca la sesión: /me y /refresh dejan de funcionar', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(204);

    await request(app.getHttpServer() as App)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(401);

    await request(app.getHttpServer() as App)
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
  });

  it('rechaza logout sin token', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/logout')
      .expect(401);
  });
});
```

## 73. `me.e2e-spec.ts` (archivo nuevo)

**Ruta:** `test/auth/me.e2e-spec.ts`

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  activateAndGetTokens,
  cleanAuthTables,
  createE2EApp,
  registerUser,
  restoreThrottler,
} from '../support/e2e-app';

describe('GET /auth/me (e2e)', () => {
  let app: INestApplication;
  const email = 'me@test.com';
  let tokens: { accessToken: string; refreshToken: string };

  beforeAll(async () => {
    app = await createE2EApp();
  });

  beforeEach(async () => {
    await cleanAuthTables(app);
    await registerUser(app, {
      email,
      firstName: 'Ana',
      lastName: 'López',
    });
    tokens = await activateAndGetTokens(app, email);
  });

  afterAll(async () => {
    restoreThrottler();
    await app.close();
  });

  it('devuelve el perfil del usuario autenticado', async () => {
    const res = await request(app.getHttpServer() as App)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body.email).toBe(email);
    expect(body.firstName).toBe('Ana');
    expect(body.lastName).toBe('López');
    expect(body.status).toBe('active');
    expect(typeof body.referralCode).toBe('string');
    expect(body.passwordHash).toBeUndefined();
  });

  it('rechaza sin token', async () => {
    await request(app.getHttpServer() as App)
      .get('/auth/me')
      .expect(401);
  });

  it('rechaza token inválido', async () => {
    await request(app.getHttpServer() as App)
      .get('/auth/me')
      .set('Authorization', 'Bearer token-inventado')
      .expect(401);
  });

  it('rechaza después de logout (sesión muerta)', async () => {
    await request(app.getHttpServer() as App)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(204);

    await request(app.getHttpServer() as App)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(401);
  });
});
```

## Tests unitarios (`.spec.ts` junto a cada archivo — 19 archivos)

Siguiendo `unit-test-checklist`: use-cases, repositorios, servicios con lógica, mapper, strategy y guards con ramas propias. `AuthService` no lleva spec (orquestación pura — cubierta por use-cases + e2e).

## 74. `register.use-case.spec.ts`

**Ruta:** `src/modules/auth/application/use-cases/register.use-case.spec.ts`

```typescript
import { Test } from '@nestjs/testing';
import { Device } from '../../domain/entities/device.entity';
import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyRegisteredException } from '../../domain/exceptions/email-already-registered.exception';
import { InvalidReferralCodeException } from '../../domain/exceptions/invalid-referral-code.exception';
import {
  DEVICE_REPOSITORY,
  IDeviceRepository,
} from '../../domain/repositories/device.repository.interface';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { CodeGeneratorService } from '../../infrastructure/services/code-generator.service';
import { PasswordHasherService } from '../../infrastructure/services/password-hasher.service';
import { VerificationCodeService } from '../services/verification-code.service';
import { RegisterCommand, RegisterUseCase } from './register.use-case';

describe('RegisterUseCase', () => {
  let useCase: RegisterUseCase;
  let users: jest.Mocked<IUserRepository>;
  let devices: jest.Mocked<IDeviceRepository>;
  let hasher: jest.Mocked<PasswordHasherService>;
  let codeGen: jest.Mocked<CodeGeneratorService>;
  let verificationCode: jest.Mocked<VerificationCodeService>;

  const command: RegisterCommand = {
    email: 'New@Test.com ',
    password: 'Password1!',
    firstName: ' Nuevo ',
    registeredIp: '1.2.3.4',
  };

  beforeEach(async () => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      save: jest.fn(),
    };
    devices = { findByUserAndFingerprint: jest.fn(), touch: jest.fn() };
    hasher = { hash: jest.fn(), verify: jest.fn() };
    codeGen = {
      generateVerificationCode: jest.fn(),
      generateSessionToken: jest.fn(),
      generateReferralCode: jest.fn(),
      hashToken: jest.fn(),
    };
    verificationCode = { issue: jest.fn() };

    hasher.hash.mockResolvedValue('bcrypt-hash');
    codeGen.generateReferralCode.mockReturnValue('ABCD2345');
    users.save.mockImplementation((u: User) => {
      u.id = 'user-1';
      return Promise.resolve(u);
    });

    const module = await Test.createTestingModule({
      providers: [
        RegisterUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: DEVICE_REPOSITORY, useValue: devices },
        { provide: PasswordHasherService, useValue: hasher },
        { provide: CodeGeneratorService, useValue: codeGen },
        { provide: VerificationCodeService, useValue: verificationCode },
      ],
    }).compile();
    useCase = module.get(RegisterUseCase);
  });

  it('crea el usuario normalizando email y emite código de verificación', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.findByReferralCode.mockResolvedValue(null);

    const user = await useCase.execute(command);

    expect(users.findByEmail).toHaveBeenCalledWith('new@test.com');
    expect(user.email).toBe('new@test.com');
    expect(user.firstName).toBe('Nuevo');
    expect(user.passwordHash).toBe('bcrypt-hash');
    expect(user.referralCode).toBe('ABCD2345');
    expect(user.registeredIp).toBe('1.2.3.4');
    expect(verificationCode.issue).toHaveBeenCalledWith(user);
    expect(devices.touch).not.toHaveBeenCalled();
  });

  it('rechaza email ya registrado', async () => {
    users.findByEmail.mockResolvedValue(new User());
    await expect(useCase.execute(command)).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredException,
    );
    expect(users.save).not.toHaveBeenCalled();
    expect(verificationCode.issue).not.toHaveBeenCalled();
  });

  it('rechaza referralCode inexistente', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.findByReferralCode.mockResolvedValue(null);
    await expect(
      useCase.execute({ ...command, referralCode: 'BADCODE1' }),
    ).rejects.toBeInstanceOf(InvalidReferralCodeException);
    expect(users.save).not.toHaveBeenCalled();
  });

  it('guarda referred_by con código válido', async () => {
    users.findByEmail.mockResolvedValue(null);
    const referrer = new User();
    referrer.id = 'referrer-1';
    users.findByReferralCode
      .mockResolvedValueOnce(referrer) // lookup del código recibido
      .mockResolvedValue(null); // el código propio generado queda libre

    const user = await useCase.execute({
      ...command,
      referralCode: 'abcd2345',
    });

    expect(users.findByReferralCode).toHaveBeenCalledWith('ABCD2345');
    expect(user.referredBy).toBe('referrer-1');
  });

  it('regenera referral_code si el primero está ocupado', async () => {
    users.findByEmail.mockResolvedValue(null);
    codeGen.generateReferralCode
      .mockReturnValueOnce('TAKEN001')
      .mockReturnValueOnce('FREE0002');
    users.findByReferralCode
      .mockResolvedValueOnce(new User()) // TAKEN001 ocupado
      .mockResolvedValueOnce(null); // FREE0002 libre

    const user = await useCase.execute(command);
    expect(user.referralCode).toBe('FREE0002');
  });

  it('hace touch del device cuando llega fingerprint', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.findByReferralCode.mockResolvedValue(null);
    const device = new Device();
    device.id = 'dev-1';
    devices.touch.mockResolvedValue(device);

    await useCase.execute({
      ...command,
      deviceFingerprint: 'fp-1',
      platform: 'android',
    });

    expect(devices.touch).toHaveBeenCalledWith('user-1', 'fp-1', 'android');
  });
});
```

## 75. `verify-email.use-case.spec.ts`

**Ruta:** `src/modules/auth/application/use-cases/verify-email.use-case.spec.ts`

```typescript
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
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { CodeGeneratorService } from '../../infrastructure/services/code-generator.service';
import { SessionService } from '../services/session.service';
import { VerifyEmailUseCase } from './verify-email.use-case';

describe('VerifyEmailUseCase', () => {
  let useCase: VerifyEmailUseCase;
  let users: jest.Mocked<IUserRepository>;
  let authTokens: jest.Mocked<IAuthTokenRepository>;
  let codeGen: jest.Mocked<CodeGeneratorService>;
  let session: jest.Mocked<SessionService>;

  const cmd = { email: 'a@b.com', code: '123456' };

  function pendingUser(): User {
    const u = new User();
    u.id = 'u1';
    u.status = UserStatus.PENDING_VERIFICATION;
    return u;
  }

  function validToken(userId: string): AuthToken {
    const t = new AuthToken();
    t.id = 'tok-1';
    t.userId = userId;
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
      consume: jest.fn(),
      consumePendingForUser: jest.fn(),
    };
    codeGen = {
      generateVerificationCode: jest.fn(),
      generateSessionToken: jest.fn(),
      generateReferralCode: jest.fn(),
      hashToken: jest.fn().mockReturnValue('sha256-of-code'),
    };
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
        VerifyEmailUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: AUTH_TOKEN_REPOSITORY, useValue: authTokens },
        { provide: CodeGeneratorService, useValue: codeGen },
        { provide: SessionService, useValue: session },
      ],
    }).compile();
    useCase = module.get(VerifyEmailUseCase);
  });

  it('verifica, activa y emite sesión', async () => {
    users.findByEmail.mockResolvedValue(pendingUser());
    authTokens.findValidByHash.mockResolvedValue(validToken('u1'));

    const result = await useCase.execute(cmd);

    expect(authTokens.findValidByHash).toHaveBeenCalledWith(
      'sha256-of-code',
      AuthTokenType.EMAIL_VERIFICATION,
    );
    expect(authTokens.consume).toHaveBeenCalledWith('tok-1');
    const saved = users.save.mock.calls[0][0];
    expect(saved.status).toBe(UserStatus.ACTIVE);
    expect(saved.emailVerifiedAt).toBeInstanceOf(Date);
    expect(result.accessToken).toBe('at');
  });

  it('rechaza email inexistente', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
    expect(authTokens.findValidByHash).not.toHaveBeenCalled();
  });

  it('rechaza usuario ya activo', async () => {
    const u = pendingUser();
    u.status = UserStatus.ACTIVE;
    users.findByEmail.mockResolvedValue(u);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
  });

  it('rechaza token de otro usuario', async () => {
    users.findByEmail.mockResolvedValue(pendingUser());
    authTokens.findValidByHash.mockResolvedValue(validToken('otro'));
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
    expect(authTokens.consume).not.toHaveBeenCalled();
  });

  it('rechaza token expirado', async () => {
    users.findByEmail.mockResolvedValue(pendingUser());
    const t = validToken('u1');
    t.expiresAt = new Date(Date.now() - 1000);
    authTokens.findValidByHash.mockResolvedValue(t);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
  });

  it('rechaza cuando no hay token válido', async () => {
    users.findByEmail.mockResolvedValue(pendingUser());
    authTokens.findValidByHash.mockResolvedValue(null);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidAuthCodeException,
    );
  });
});
```

## 76. `resend-verification.use-case.spec.ts`

**Ruta:** `src/modules/auth/application/use-cases/resend-verification.use-case.spec.ts`

```typescript
import { Test } from '@nestjs/testing';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { VerificationCodeService } from '../services/verification-code.service';
import { ResendVerificationUseCase } from './resend-verification.use-case';

describe('ResendVerificationUseCase', () => {
  let useCase: ResendVerificationUseCase;
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
    verificationCode = { issue: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ResendVerificationUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: VerificationCodeService, useValue: verificationCode },
      ],
    }).compile();
    useCase = module.get(ResendVerificationUseCase);
  });

  it('emite código nuevo si el usuario está pendiente', async () => {
    const u = new User();
    u.status = UserStatus.PENDING_VERIFICATION;
    users.findByEmail.mockResolvedValue(u);
    await useCase.execute({ email: 'a@b.com' });
    expect(verificationCode.issue).toHaveBeenCalledWith(u);
  });

  it('silencio si el email no existe (anti-enumeración)', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(
      useCase.execute({ email: 'ghost@b.com' }),
    ).resolves.toBeUndefined();
    expect(verificationCode.issue).not.toHaveBeenCalled();
  });

  it('silencio si el usuario ya está activo', async () => {
    const u = new User();
    u.status = UserStatus.ACTIVE;
    users.findByEmail.mockResolvedValue(u);
    await useCase.execute({ email: 'a@b.com' });
    expect(verificationCode.issue).not.toHaveBeenCalled();
  });
});
```

## 77. `login.use-case.spec.ts`

**Ruta:** `src/modules/auth/application/use-cases/login.use-case.spec.ts`

```typescript
import { Test } from '@nestjs/testing';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { EmailNotVerifiedException } from '../../domain/exceptions/email-not-verified.exception';
import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';
import { UserSuspendedException } from '../../domain/exceptions/user-suspended.exception';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { PasswordHasherService } from '../../infrastructure/services/password-hasher.service';
import { SessionService } from '../services/session.service';
import { LoginUseCase } from './login.use-case';

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;
  let users: jest.Mocked<IUserRepository>;
  let hasher: jest.Mocked<PasswordHasherService>;
  let session: jest.Mocked<SessionService>;

  const cmd = { email: 'a@b.com', password: 'Password1!' };

  function activeUser(): User {
    const u = new User();
    u.status = UserStatus.ACTIVE;
    u.passwordHash = 'hash';
    return u;
  }

  beforeEach(async () => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      save: jest.fn(),
    };
    hasher = { hash: jest.fn(), verify: jest.fn() };
    session = {
      issue: jest
        .fn()
        .mockImplementation((u: User) =>
          Promise.resolve({ user: u, accessToken: 'at', refreshToken: 'rt' }),
        ),
    } as unknown as jest.Mocked<SessionService>;

    const module = await Test.createTestingModule({
      providers: [
        LoginUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: PasswordHasherService, useValue: hasher },
        { provide: SessionService, useValue: session },
      ],
    }).compile();
    useCase = module.get(LoginUseCase);
  });

  it('emite sesión con credenciales válidas', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    hasher.verify.mockResolvedValue(true);
    const result = await useCase.execute(cmd);
    expect(result.accessToken).toBe('at');
    expect(session.issue).toHaveBeenCalled();
  });

  it('401 si el email no existe', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it('401 si la cuenta es solo-Google (sin passwordHash)', async () => {
    const u = activeUser();
    u.passwordHash = null;
    users.findByEmail.mockResolvedValue(u);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });

  it('401 si el password no coincide', async () => {
    users.findByEmail.mockResolvedValue(activeUser());
    hasher.verify.mockResolvedValue(false);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(session.issue).not.toHaveBeenCalled();
  });

  it('403 si el email no está verificado', async () => {
    const u = activeUser();
    u.status = UserStatus.PENDING_VERIFICATION;
    users.findByEmail.mockResolvedValue(u);
    hasher.verify.mockResolvedValue(true);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      EmailNotVerifiedException,
    );
    expect(session.issue).not.toHaveBeenCalled();
  });

  it('403 si la cuenta está suspendida', async () => {
    const u = activeUser();
    u.status = UserStatus.SUSPENDED;
    users.findByEmail.mockResolvedValue(u);
    hasher.verify.mockResolvedValue(true);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      UserSuspendedException,
    );
  });
});
```

## 78. `refresh.use-case.spec.ts`

**Ruta:** `src/modules/auth/application/use-cases/refresh.use-case.spec.ts`

```typescript
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { CompromisedSessionException } from '../../domain/exceptions/compromised-session.exception';
import { InvalidRefreshTokenException } from '../../domain/exceptions/invalid-refresh-token.exception';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { CodeGeneratorService } from '../../infrastructure/services/code-generator.service';
import { RefreshUseCase } from './refresh.use-case';

describe('RefreshUseCase', () => {
  let useCase: RefreshUseCase;
  let refreshTokens: jest.Mocked<IRefreshTokenRepository>;
  let users: jest.Mocked<IUserRepository>;
  let codeGen: jest.Mocked<CodeGeneratorService>;
  let jwt: jest.Mocked<JwtService>;
  let config: jest.Mocked<ConfigService>;

  const cmd = { refreshToken: 'opaque-token' };

  function liveToken(): RefreshToken {
    const t = new RefreshToken();
    t.id = 'rt-1';
    t.userId = 'u1';
    t.deviceId = 'dev-1';
    t.expiresAt = new Date(Date.now() + 86_400_000);
    return t;
  }

  beforeEach(async () => {
    refreshTokens = {
      save: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findByReferralCode: jest.fn(),
      save: jest.fn(),
    };
    codeGen = {
      generateVerificationCode: jest.fn(),
      generateSessionToken: jest
        .fn()
        .mockReturnValue({ token: 'new-opaque', tokenHash: 'new-hash' }),
      generateReferralCode: jest.fn(),
      hashToken: jest.fn().mockReturnValue('hash-of-token'),
    };
    jwt = {
      sign: jest.fn().mockReturnValue('new-access'),
    } as unknown as jest.Mocked<JwtService>;
    config = {
      get: jest.fn().mockReturnValue(30),
    } as unknown as jest.Mocked<ConfigService>;
    refreshTokens.save.mockImplementation((t: RefreshToken) => {
      t.id = 'rt-2';
      return Promise.resolve(t);
    });

    const module = await Test.createTestingModule({
      providers: [
        RefreshUseCase,
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: refreshTokens },
        { provide: USER_REPOSITORY, useValue: users },
        { provide: CodeGeneratorService, useValue: codeGen },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    useCase = module.get(RefreshUseCase);
  });

  it('rota el token y conserva el deviceId', async () => {
    refreshTokens.findByTokenHash.mockResolvedValue(liveToken());
    const u = new User();
    u.id = 'u1';
    u.status = UserStatus.ACTIVE;
    users.findById.mockResolvedValue(u);

    const result = await useCase.execute(cmd);

    expect(refreshTokens.findByTokenHash).toHaveBeenCalledWith(
      'hash-of-token',
    );
    expect(refreshTokens.revoke).toHaveBeenCalledWith('rt-1');
    const saved = refreshTokens.save.mock.calls[0][0];
    expect(saved.deviceId).toBe('dev-1');
    expect(saved.tokenHash).toBe('new-hash');
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1', sid: 'rt-2' }),
    );
    expect(result).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-opaque',
    });
  });

  it('rechaza token inexistente', async () => {
    refreshTokens.findByTokenHash.mockResolvedValue(null);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidRefreshTokenException,
    );
  });

  it('reuso de token revocado → revoca todas las sesiones', async () => {
    const t = liveToken();
    t.revokedAt = new Date();
    refreshTokens.findByTokenHash.mockResolvedValue(t);

    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      CompromisedSessionException,
    );
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    expect(refreshTokens.save).not.toHaveBeenCalled();
  });

  it('rechaza token expirado', async () => {
    const t = liveToken();
    t.expiresAt = new Date(Date.now() - 1000);
    refreshTokens.findByTokenHash.mockResolvedValue(t);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidRefreshTokenException,
    );
  });

  it('rechaza si el usuario ya no está activo', async () => {
    refreshTokens.findByTokenHash.mockResolvedValue(liveToken());
    const u = new User();
    u.status = UserStatus.SUSPENDED;
    users.findById.mockResolvedValue(u);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      InvalidRefreshTokenException,
    );
    expect(refreshTokens.revoke).not.toHaveBeenCalled();
  });
});
```

## 79. `logout.use-case.spec.ts` y `get-me.use-case.spec.ts`

**`src/modules/auth/application/use-cases/logout.use-case.spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import { LogoutUseCase } from './logout.use-case';

describe('LogoutUseCase', () => {
  it('revoca la sesión indicada', async () => {
    const refreshTokens: jest.Mocked<IRefreshTokenRepository> = {
      save: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        LogoutUseCase,
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: refreshTokens },
      ],
    }).compile();
    const useCase = module.get(LogoutUseCase);

    await useCase.execute({ sessionId: 'sid-1' });
    expect(refreshTokens.revoke).toHaveBeenCalledWith('sid-1');
  });
});
```

**`src/modules/auth/application/use-cases/get-me.use-case.spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { SessionNotFoundException } from '../../domain/exceptions/session-not-found.exception';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { GetMeUseCase } from './get-me.use-case';

describe('GetMeUseCase', () => {
  let useCase: GetMeUseCase;
  let users: jest.Mocked<IUserRepository>;
  let refreshTokens: jest.Mocked<IRefreshTokenRepository>;

  function activeUser(): User {
    const u = new User();
    u.id = 'u1';
    u.status = UserStatus.ACTIVE;
    return u;
  }

  function liveSession(userId = 'u1'): RefreshToken {
    const t = new RefreshToken();
    t.userId = userId;
    t.expiresAt = new Date(Date.now() + 86_400_000);
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
    refreshTokens = {
      save: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        GetMeUseCase,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: refreshTokens },
      ],
    }).compile();
    useCase = module.get(GetMeUseCase);
  });

  it('devuelve el usuario con sesión viva', async () => {
    users.findById.mockResolvedValue(activeUser());
    refreshTokens.findById.mockResolvedValue(liveSession());
    const user = await useCase.execute({ userId: 'u1', sessionId: 's1' });
    expect(user.id).toBe('u1');
  });

  it('401 si la sesión está revocada (logout)', async () => {
    users.findById.mockResolvedValue(activeUser());
    const s = liveSession();
    s.revokedAt = new Date();
    refreshTokens.findById.mockResolvedValue(s);
    await expect(
      useCase.execute({ userId: 'u1', sessionId: 's1' }),
    ).rejects.toBeInstanceOf(SessionNotFoundException);
  });

  it('401 si la sesión pertenece a otro usuario', async () => {
    users.findById.mockResolvedValue(activeUser());
    refreshTokens.findById.mockResolvedValue(liveSession('otro'));
    await expect(
      useCase.execute({ userId: 'u1', sessionId: 's1' }),
    ).rejects.toBeInstanceOf(SessionNotFoundException);
  });

  it('401 si la sesión expiró', async () => {
    users.findById.mockResolvedValue(activeUser());
    const s = liveSession();
    s.expiresAt = new Date(Date.now() - 1);
    refreshTokens.findById.mockResolvedValue(s);
    await expect(
      useCase.execute({ userId: 'u1', sessionId: 's1' }),
    ).rejects.toBeInstanceOf(SessionNotFoundException);
  });

  it('401 si el usuario está suspendido', async () => {
    const u = activeUser();
    u.status = UserStatus.SUSPENDED;
    users.findById.mockResolvedValue(u);
    refreshTokens.findById.mockResolvedValue(liveSession());
    await expect(
      useCase.execute({ userId: 'u1', sessionId: 's1' }),
    ).rejects.toBeInstanceOf(SessionNotFoundException);
  });
});
```

## 80. `session.service.spec.ts`

**Ruta:** `src/modules/auth/application/services/session.service.spec.ts`

```typescript
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Device } from '../../domain/entities/device.entity';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { User } from '../../domain/entities/user.entity';
import {
  DEVICE_REPOSITORY,
  IDeviceRepository,
} from '../../domain/repositories/device.repository.interface';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import { CodeGeneratorService } from '../../infrastructure/services/code-generator.service';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;
  let devices: jest.Mocked<IDeviceRepository>;
  let refreshTokens: jest.Mocked<IRefreshTokenRepository>;
  let codeGen: jest.Mocked<CodeGeneratorService>;
  let jwt: jest.Mocked<JwtService>;
  let config: jest.Mocked<ConfigService>;

  const user = Object.assign(new User(), { id: 'u1', email: 'a@b.com', role: 'customer' });

  beforeEach(async () => {
    devices = { findByUserAndFingerprint: jest.fn(), touch: jest.fn() };
    refreshTokens = {
      save: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    codeGen = {
      generateVerificationCode: jest.fn(),
      generateSessionToken: jest
        .fn()
        .mockReturnValue({ token: 'opaque', tokenHash: 'opaque-hash' }),
      generateReferralCode: jest.fn(),
      hashToken: jest.fn(),
    };
    jwt = {
      sign: jest.fn().mockReturnValue('access'),
    } as unknown as jest.Mocked<JwtService>;
    config = {
      get: jest.fn().mockReturnValue(30),
    } as unknown as jest.Mocked<ConfigService>;
    refreshTokens.save.mockImplementation((t: RefreshToken) => {
      t.id = 'sid-1';
      return Promise.resolve(t);
    });

    const module = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: DEVICE_REPOSITORY, useValue: devices },
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: refreshTokens },
        { provide: CodeGeneratorService, useValue: codeGen },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get(SessionService);
  });

  it('emite sesión con deviceId cuando llega fingerprint', async () => {
    const device = new Device();
    device.id = 'dev-1';
    devices.touch.mockResolvedValue(device);

    const result = await service.issue(user, 'fp-1', 'android');

    expect(devices.touch).toHaveBeenCalledWith('u1', 'fp-1', 'android');
    const saved = refreshTokens.save.mock.calls[0][0];
    expect(saved.deviceId).toBe('dev-1');
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1', sid: 'sid-1' }),
    );
    expect(result.refreshToken).toBe('opaque');
  });

  it('emite sesión sin device cuando no llega fingerprint', async () => {
    await service.issue(user);
    expect(devices.touch).not.toHaveBeenCalled();
    const saved = refreshTokens.save.mock.calls[0][0];
    expect(saved.deviceId).toBeNull();
  });
});
```

## 81. `verification-code.service.spec.ts`

**Ruta:** `src/modules/auth/application/services/verification-code.service.spec.ts`

```typescript
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthToken } from '../../domain/entities/auth-token.entity';
import { User } from '../../domain/entities/user.entity';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import {
  AUTH_TOKEN_REPOSITORY,
  IAuthTokenRepository,
} from '../../domain/repositories/auth-token.repository.interface';
import { CodeGeneratorService } from '../../infrastructure/services/code-generator.service';
import { EmailSenderService } from '../../infrastructure/services/email-sender.service';
import { VerificationCodeService } from './verification-code.service';

describe('VerificationCodeService', () => {
  it('invalida códigos previos, guarda hash y envía el plano', async () => {
    const authTokens: jest.Mocked<IAuthTokenRepository> = {
      save: jest.fn(),
      findValidByHash: jest.fn(),
      consume: jest.fn(),
      consumePendingForUser: jest.fn(),
    };
    const codeGen: jest.Mocked<CodeGeneratorService> = {
      generateVerificationCode: jest.fn().mockReturnValue('654321'),
      generateSessionToken: jest.fn(),
      generateReferralCode: jest.fn(),
      hashToken: jest.fn().mockReturnValue('sha256-of-654321'),
    };
    const emailSender: jest.Mocked<EmailSenderService> = {
      sendVerificationCode: jest.fn(),
      sendPasswordResetCode: jest.fn(),
    };
    const config = {
      get: jest.fn().mockReturnValue(15),
    } as unknown as jest.Mocked<ConfigService>;
    authTokens.save.mockImplementation((t: AuthToken) => Promise.resolve(t));

    const module = await Test.createTestingModule({
      providers: [
        VerificationCodeService,
        { provide: AUTH_TOKEN_REPOSITORY, useValue: authTokens },
        { provide: CodeGeneratorService, useValue: codeGen },
        { provide: EmailSenderService, useValue: emailSender },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    const service = module.get(VerificationCodeService);

    const user = Object.assign(new User(), { id: 'u1', email: 'a@b.com' });
    await service.issue(user);

    expect(authTokens.consumePendingForUser).toHaveBeenCalledWith(
      'u1',
      AuthTokenType.EMAIL_VERIFICATION,
    );
    const saved = authTokens.save.mock.calls[0][0];
    expect(saved.tokenHash).toBe('sha256-of-654321');
    expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(emailSender.sendVerificationCode).toHaveBeenCalledWith(
      'a@b.com',
      '654321',
    );
  });
});
```

## 82. `user.repository.spec.ts`

**Ruta:** `src/modules/auth/infrastructure/repositories/user.repository.spec.ts`

```typescript
import { QueryFailedError, Repository } from 'typeorm';
import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyRegisteredException } from '../../domain/exceptions/email-already-registered.exception';
import { UserRepository } from './user.repository';

describe('UserRepository', () => {
  let repo: UserRepository;
  let orm: jest.Mocked<Repository<User>>;

  beforeEach(() => {
    orm = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;
    repo = new UserRepository(orm);
  });

  it('findByEmail normaliza a minúsculas y excluye soft-deleted', async () => {
    orm.findOne.mockResolvedValue(null);
    await repo.findByEmail('A@B.COM');
    expect(orm.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: 'a@b.com' }),
      }),
    );
  });

  it('save traduce unique violation de email a 409', async () => {
    const driverError = { code: '23505', constraint: 'uq_users_email' };
    orm.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], driverError),
    );
    await expect(repo.save(new User())).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredException,
    );
  });

  it('save re-lanza errores que no son unique de email', async () => {
    const error = new Error('connection lost');
    orm.save.mockRejectedValue(error);
    await expect(repo.save(new User())).rejects.toBe(error);
  });
});
```

## 83. `device.repository.spec.ts`

**Ruta:** `src/modules/auth/infrastructure/repositories/device.repository.spec.ts`

```typescript
import { QueryFailedError, Repository } from 'typeorm';
import { Device } from '../../domain/entities/device.entity';
import { DeviceRepository } from './device.repository';

describe('DeviceRepository', () => {
  let repo: DeviceRepository;
  let orm: jest.Mocked<Repository<Device>>;

  beforeEach(() => {
    orm = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Device>>;
    repo = new DeviceRepository(orm);
  });

  it('touch crea el device si no existe', async () => {
    orm.findOne.mockResolvedValue(null);
    orm.save.mockImplementation((d: Device) => Promise.resolve(d));
    const device = await repo.touch('u1', 'fp-1', 'android');
    expect(orm.save).toHaveBeenCalled();
    expect(device.userId).toBe('u1');
    expect(device.fingerprint).toBe('fp-1');
  });

  it('touch actualiza last_seen si ya existe', async () => {
    const existing = new Device();
    existing.platform = 'android';
    orm.findOne.mockResolvedValue(existing);
    orm.save.mockImplementation((d: Device) => Promise.resolve(d));
    const device = await repo.touch('u1', 'fp-1', 'ios');
    expect(device.platform).toBe('ios');
    expect(orm.save).toHaveBeenCalledWith(existing);
  });

  it('touch resuelve carrera del UNIQUE devolviendo al ganador', async () => {
    const winner = new Device();
    orm.findOne
      .mockResolvedValueOnce(null) // no existía
      .mockResolvedValueOnce(winner); // el otro proceso ganó
    orm.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], { code: '23505' }),
    );
    const device = await repo.touch('u1', 'fp-1', null);
    expect(device).toBe(winner);
  });
});
```

## 84. `auth-token.repository.spec.ts` y `refresh-token.repository.spec.ts`

**`src/modules/auth/infrastructure/repositories/auth-token.repository.spec.ts`**

```typescript
import { IsNull, Repository } from 'typeorm';
import { AuthToken } from '../../domain/entities/auth-token.entity';
import { AuthTokenType } from '../../domain/enums/auth-token-type.enum';
import { AuthTokenRepository } from './auth-token.repository';

describe('AuthTokenRepository', () => {
  let repo: AuthTokenRepository;
  let orm: jest.Mocked<Repository<AuthToken>>;

  beforeEach(() => {
    orm = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<AuthToken>>;
    repo = new AuthTokenRepository(orm);
  });

  it('findValidByHash filtra por tipo y no consumido', async () => {
    orm.findOne.mockResolvedValue(null);
    await repo.findValidByHash('h', AuthTokenType.EMAIL_VERIFICATION);
    expect(orm.findOne).toHaveBeenCalledWith({
      where: {
        tokenHash: 'h',
        type: AuthTokenType.EMAIL_VERIFICATION,
        consumedAt: IsNull(),
      },
    });
  });

  it('consume marca consumed_at solo si estaba pendiente', async () => {
    await repo.consume('tok-1');
    expect(orm.update).toHaveBeenCalledWith(
      { id: 'tok-1', consumedAt: IsNull() },
      { consumedAt: expect.any(Date) },
    );
  });

  it('consumePendingForUser invalida códigos previos del mismo tipo', async () => {
    await repo.consumePendingForUser('u1', AuthTokenType.PASSWORD_RESET);
    expect(orm.update).toHaveBeenCalledWith(
      { userId: 'u1', type: AuthTokenType.PASSWORD_RESET, consumedAt: IsNull() },
      { consumedAt: expect.any(Date) },
    );
  });
});
```

**`src/modules/auth/infrastructure/repositories/refresh-token.repository.spec.ts`**

```typescript
import { IsNull, Repository } from 'typeorm';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { RefreshTokenRepository } from './refresh-token.repository';

describe('RefreshTokenRepository', () => {
  let repo: RefreshTokenRepository;
  let orm: jest.Mocked<Repository<RefreshToken>>;

  beforeEach(() => {
    orm = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<RefreshToken>>;
    repo = new RefreshTokenRepository(orm);
  });

  it('revoke marca revoked_at solo si estaba activa', async () => {
    await repo.revoke('rt-1');
    expect(orm.update).toHaveBeenCalledWith(
      { id: 'rt-1', revokedAt: IsNull() },
      { revokedAt: expect.any(Date) },
    );
  });

  it('revokeAllForUser revoca todas las sesiones vivas', async () => {
    await repo.revokeAllForUser('u1');
    expect(orm.update).toHaveBeenCalledWith(
      { userId: 'u1', revokedAt: IsNull() },
      { revokedAt: expect.any(Date) },
    );
  });
});
```

## 85. `auth.mapper.spec.ts`

**Ruta:** `src/modules/auth/application/mappers/auth.mapper.spec.ts`

```typescript
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { AuthMapper } from './auth.mapper';

describe('AuthMapper', () => {
  const mapper = new AuthMapper();

  function user(): User {
    const u = new User();
    u.id = 'u1';
    u.email = 'a@b.com';
    u.firstName = 'Ana';
    u.role = UserRole.CUSTOMER;
    u.status = UserStatus.ACTIVE;
    u.referralCode = 'ABCD2345';
    u.createdAt = new Date('2026-01-01T00:00:00Z');
    u.updatedAt = u.createdAt;
    return u;
  }

  it('toUserResponse serializa fechas a ISO y nulos explícitos', () => {
    const dto = mapper.toUserResponse(user());
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(dto.lastName).toBeNull();
    expect(dto.phone).toBeNull();
    expect(dto.emailVerifiedAt).toBeNull();
    expect(dto.role).toBe('customer');
    expect(dto).not.toHaveProperty('passwordHash');
  });

  it('toAuthResponse empaqueta tokens + usuario', () => {
    const dto = mapper.toAuthResponse(user(), {
      accessToken: 'at',
      refreshToken: 'rt',
    });
    expect(dto.accessToken).toBe('at');
    expect(dto.refreshToken).toBe('rt');
    expect(dto.user.email).toBe('a@b.com');
  });
});
```

## 86. `code-generator.service.spec.ts` y `password-hasher.service.spec.ts`

**`src/modules/auth/infrastructure/services/code-generator.service.spec.ts`**

```typescript
import { createHash } from 'crypto';
import { CodeGeneratorService } from './code-generator.service';

describe('CodeGeneratorService', () => {
  const gen = new CodeGeneratorService();

  it('genera códigos de 6 dígitos', () => {
    for (let i = 0; i < 50; i++) {
      expect(gen.generateVerificationCode()).toMatch(/^\d{6}$/);
    }
  });

  it('generateSessionToken devuelve token opaco + su sha256', () => {
    const { token, tokenHash } = gen.generateSessionToken();
    expect(token.length).toBeGreaterThan(40);
    expect(tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
  });

  it('generateReferralCode usa alfabeto sin ambiguos y largo 8', () => {
    const code = gen.generateReferralCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(code).not.toMatch(/[01IO]/);
  });
});
```

**`src/modules/auth/infrastructure/services/password-hasher.service.spec.ts`**

```typescript
import { PasswordHasherService } from './password-hasher.service';

describe('PasswordHasherService', () => {
  const hasher = new PasswordHasherService();

  it('hash + verify roundtrip', async () => {
    const hash = await hasher.hash('Password1!');
    expect(hash).not.toContain('Password1!');
    await expect(hasher.verify(hash, 'Password1!')).resolves.toBe(true);
  });

  it('verify devuelve false con password errado', async () => {
    const hash = await hasher.hash('Password1!');
    await expect(hasher.verify(hash, 'Otro123')).resolves.toBe(false);
  });

  it('verify devuelve false con hash inválido', async () => {
    await expect(hasher.verify('not-a-bcrypt-hash', 'x')).resolves.toBe(false);
  });
});
```

## 87. `jwt.strategy.spec.ts`, `jwt-auth.guard.spec.ts`, `roles.guard.spec.ts` y `email-sender.service.spec.ts`

**`src/modules/auth/infrastructure/strategies/jwt.strategy.spec.ts`**

```typescript
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  it('validate mapea el payload al usuario del request', () => {
    const config = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as jest.Mocked<ConfigService>;
    const strategy = new JwtStrategy(config);

    const user = strategy.validate({
      sub: 'u1',
      sid: 's1',
      email: 'a@b.com',
      role: 'customer',
    });

    expect(user).toEqual({
      userId: 'u1',
      sessionId: 's1',
      email: 'a@b.com',
      role: 'customer',
    });
    expect(config.get).toHaveBeenCalledWith('auth.jwtSecret');
  });
});
```

**`src/common/guards/jwt-auth.guard.spec.ts`**

```typescript
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;

  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new JwtAuthGuard(reflector);
  });

  it('deja pasar rutas @Public sin consultar passport', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('delega a passport cuando la ruta no es pública', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const parent = jest
      .spyOn(
        Object.getPrototypeOf(JwtAuthGuard.prototype) as {
          canActivate: (c: ExecutionContext) => unknown;
        },
        'canActivate',
      )
      .mockReturnValue(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(parent).toHaveBeenCalledWith(context);
    parent.mockRestore();
  });
});
```

**`src/common/guards/roles.guard.spec.ts`**

```typescript
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: RolesGuard;

  function context(role?: string): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new RolesGuard(reflector);
  });

  it('sin @Roles en la ruta → pasa', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(context('customer'))).toBe(true);
  });

  it('rol que coincide → pasa', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    expect(guard.canActivate(context('admin'))).toBe(true);
  });

  it('rol distinto → bloquea', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    expect(guard.canActivate(context('customer'))).toBe(false);
  });

  it('sin usuario → bloquea', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    expect(guard.canActivate(context())).toBe(false);
  });
});
```

**`src/modules/auth/infrastructure/services/email-sender.service.spec.ts`**

```typescript
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../../common/logger/logger.service';
import { EmailSenderService } from './email-sender.service';

describe('EmailSenderService', () => {
  let service: EmailSenderService;
  let logger: jest.Mocked<LoggerService>;
  let config: jest.Mocked<ConfigService>;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;
    config = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;
    fetchSpy = jest.spyOn(global, 'fetch');
    service = new EmailSenderService(logger, config);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('sin API key → loguea el código y no llama a la API', async () => {
    config.get.mockReturnValue(null);
    await service.sendVerificationCode('a@b.com', '123456');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('123456'),
      'EmailSenderService',
    );
  });

  it('con API key → POST a la API de Resend', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'email.resendApiKey' ? 're_test' : 'PCalientes <onboarding@resend.dev>',
    );
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

    await service.sendVerificationCode('a@b.com', '123456');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test',
        }),
      }),
    );
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as { body: string }).body,
    ) as { to: string; html: string };
    expect(body.to).toBe('a@b.com');
    expect(body.html).toContain('123456');
  });

  it('falla la API → lanza y loguea el error', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'email.resendApiKey' ? 're_test' : 'from',
    );
    fetchSpy.mockResolvedValue(
      new Response('{"message":"invalid key"}', { status: 403 }),
    );

    await expect(
      service.sendVerificationCode('a@b.com', '123456'),
    ).rejects.toThrow('Email delivery failed: 403');
    expect(logger.error).toHaveBeenCalled();
  });
});
```

## Documentación de API (8 archivos nuevos — `api-docs`)

## 88. `documentacion/api/README.md`

**Ruta:** `documentacion/api/README.md`

```markdown
# API — PCalientes

Contrato para consumidores de la API (app Flutter y futuros integradores).

## Convenciones globales

- **Base URL dev**: `http://localhost:3000`
- **Auth**: `Authorization: Bearer <accessToken>` — se obtiene en
  `POST /auth/verify-email` o `POST /auth/login`. Duración: access 15 min,
  refresh 30 días (rotativo — cada `POST /auth/refresh` invalida el anterior).
- **Errores**: `{ "statusCode": N, "message": string | string[], "timestamp": "..." }`
  — `message` es **array** en errores de validación (400, un string por regla).
- **Rate limiting**: límites por endpoint indicados en cada doc. El global es
  100 req/min (`/health` exento).
- **Verificación de email obligatoria**: `register` no devuelve sesión; el
  código de 6 dígitos enviado por email se canjea en `verify-email`, que sí
  devuelve los tokens.
- **Device fingerprint** (opcional en register/verify/login): identificador
  estable del dispositivo (`ANDROID_ID` en Android; UUID en Keychain en iOS).
  Se usa para anti-fraude de promociones.

## Índice

| Método | Ruta | Doc | Estado |
|--------|------|-----|--------|
| POST | `/auth/register` | [001](auth/001-post-register.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/verify-email` | [002](auth/002-post-verify-email.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/resend-verification` | [003](auth/003-post-resend-verification.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/login` | [004](auth/004-post-login.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/refresh` | [005](auth/005-post-refresh.md) | 🔶 backend listo — sin integrar |
| POST | `/auth/logout` | [006](auth/006-post-logout.md) | 🔶 backend listo — sin integrar |
| GET | `/auth/me` | [007](auth/007-get-me.md) | 🔶 backend listo — sin integrar |
```

## 89. `documentacion/api/auth/001-post-register.md`

**Ruta:** `documentacion/api/auth/001-post-register.md`

```markdown
# POST /auth/register

> Registra un cliente nuevo. Queda `pending_verification` — la sesión se obtiene
> en `POST /auth/verify-email` con el código de 6 dígitos enviado al email.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/register` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 3 req/min |
| **Implementado** | propuesta 002 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `email` | string | sí | `IsEmail` | Único, case-insensitive |
| `password` | string | sí | `MinLength(8)`, `MaxLength(72)` | Se guarda con bcrypt |
| `firstName` | string | sí | `Length(1,100)` | |
| `lastName` | string | no | `MaxLength(100)` | |
| `phone` | string | no | `MaxLength(20)` | Contacto para delivery |
| `referralCode` | string | no | `MaxLength(20)` | Código de otro usuario |
| `marketingOptIn` | boolean | no | — | Consentimiento de promos (default `false`) |
| `deviceFingerprint` | string | no | `MaxLength(255)` | ID estable del dispositivo |
| `platform` | string | no | `android` \| `ios` | |

```json
{
  "email": "ana@test.com",
  "password": "Password1!",
  "firstName": "Ana",
  "lastName": "López",
  "deviceFingerprint": "a1b2c3d4e5f6",
  "platform": "android"
}
```

## Responses

### 201 — Creado
```json
{
  "id": "3f8a0c1e-...",
  "email": "ana@test.com",
  "firstName": "Ana",
  "lastName": "López",
  "phone": null,
  "role": "customer",
  "status": "pending_verification",
  "emailVerifiedAt": null,
  "referralCode": "XK2P9QRD",
  "marketingOptIn": false,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### 400 — Validación / `referralCode` inválido
`message` es array en errores de campos; `"Invalid referral code"` si el código no existe.

### 409 — Email ya registrado
```json
{ "statusCode": 409, "message": "Email is already registered", "timestamp": "..." }
```

## Notas

- No devuelve tokens: `pending_verification` no puede operar hasta verificar.
- Campos extra (`role`, `status`, …) se rechazan con 400 (`forbidNonWhitelisted`).
- `referralCode` propio se genera siempre (8 caracteres sin ambiguos).
```

## 90. `documentacion/api/auth/002-post-verify-email.md`

**Ruta:** `documentacion/api/auth/002-post-verify-email.md`

```markdown
# POST /auth/verify-email

> Canjea el código de 6 dígitos enviado al email. Activa la cuenta y devuelve
> la sesión lista para usar.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/verify-email` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 5 req/min |
| **Implementado** | propuesta 002 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `email` | string | sí | `IsEmail` | |
| `code` | string | sí | 6 dígitos | Código del email de verificación |
| `deviceFingerprint` | string | no | `MaxLength(255)` | |
| `platform` | string | no | `android` \| `ios` | |

```json
{ "email": "ana@test.com", "code": "482910" }
```

## Responses

### 200 — Verificado
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "X9v2...",
  "user": { "id": "...", "email": "ana@test.com", "status": "active", "emailVerifiedAt": "2026-01-01T00:00:00.000Z", "referralCode": "XK2P9QRD", "...": "..." }
}
```

| Campo | Descripción |
|-------|-------------|
| `accessToken` | JWT 15 min — payload `{sub, sid, email, role}` |
| `refreshToken` | Token opaco 30 días, rotativo — solo para `POST /auth/refresh` |

### 400 — Código inválido, expirado, de otro usuario o ya consumido
```json
{ "statusCode": 400, "message": "Invalid or expired code", "timestamp": "..." }
```

## Notas

- El código es single-use y ligado al email — no sirve el de otra cuenta.
- El código vence a los 15 min; `POST /auth/resend-verification` emite uno nuevo.
```

## 91. `documentacion/api/auth/003-post-resend-verification.md`

**Ruta:** `documentacion/api/auth/003-post-resend-verification.md`

```markdown
# POST /auth/resend-verification

> Emite un nuevo código de verificación e invalida el anterior.
> Respuesta siempre genérica (anti-enumeración).

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/resend-verification` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 3 req/min |
| **Implementado** | propuesta 002 |

## Request

### Body
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `email` | string | sí | `IsEmail` |

```json
{ "email": "ana@test.com" }
```

## Responses

### 200 — Siempre el mismo mensaje
```json
{ "message": "If that email is registered and unverified, a new code has been sent." }
```

## Notas

- Da la misma respuesta para: email inexistente, ya verificado, o código nuevo emitido — no revela si la cuenta existe.
- El código anterior queda invalidado aunque aún no haya expirado.
```

## 92. `documentacion/api/auth/004-post-login.md`

**Ruta:** `documentacion/api/auth/004-post-login.md`

```markdown
# POST /auth/login

> Login con email + password. Devuelve la sesión completa.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/login` |
| **Autenticación** | Pública |
| **Rol requerido** | — |
| **Rate limit** | 5 req/min |
| **Implementado** | propuesta 002 |

## Request

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `email` | string | sí | `IsEmail` | |
| `password` | string | sí | `IsNotEmpty` | |
| `deviceFingerprint` | string | no | `MaxLength(255)` | |
| `platform` | string | no | `android` \| `ios` | |

```json
{ "email": "ana@test.com", "password": "Password1!", "deviceFingerprint": "a1b2c3d4e5f6", "platform": "android" }
```

## Responses

### 200 — Sesión emitida
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "X9v2...",
  "user": { "id": "...", "email": "ana@test.com", "status": "active", "...": "..." }
}
```

### 401 — Credenciales inválidas
```json
{ "statusCode": 401, "message": "Invalid credentials", "timestamp": "..." }
```
Mismo mensaje para email inexistente, password errado o cuenta solo-Google (anti-enumeración).

### 403 — Email no verificado / cuenta suspendida
```json
{ "statusCode": 403, "message": "Email is not verified", "timestamp": "..." }
{ "statusCode": 403, "message": "Account is suspended", "timestamp": "..." }
```

## Notas

- Con `deviceFingerprint` el dispositivo queda registrado y la sesión queda
  ligada a él (`refresh_tokens.device_id`).
```

## 93. `documentacion/api/auth/005-post-refresh.md`

**Ruta:** `documentacion/api/auth/005-post-refresh.md`

```markdown
# POST /auth/refresh

> Rota el refresh token y emite un access token nuevo. El token presentado
> queda revocado.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/refresh` |
| **Autenticación** | Pública (usa el refresh token, no el access) |
| **Rol requerido** | — |
| **Rate limit** | 10 req/min |
| **Implementado** | propuesta 002 |

## Request

### Body
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `refreshToken` | string | sí | `IsNotEmpty` |

```json
{ "refreshToken": "X9v2..." }
```

## Responses

### 200 — Rotado
```json
{ "accessToken": "eyJhbGciOi...", "refreshToken": "Z1w3..." }
```

### 401 — Token inexistente, expirado o revocado
```json
{ "statusCode": 401, "message": "Invalid or expired session", "timestamp": "..." }
{ "statusCode": 401, "message": "Session expired, please log in again", "timestamp": "..." }
```

## Notas

- **Reuso de token revocado** = posible robo → se revocan TODAS las sesiones
  del usuario (segundo mensaje).
- El nuevo refresh token conserva el `device_id` de la sesión original.
```

## 94. `documentacion/api/auth/006-post-logout.md`

**Ruta:** `documentacion/api/auth/006-post-logout.md`

```markdown
# POST /auth/logout

> Revoca la sesión actual (la fila `refresh_tokens` ligada al access token).

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/logout` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | — |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 002 |

## Request

### Headers
| Header | Requerido |
|--------|-----------|
| `Authorization: Bearer <accessToken>` | sí |

Sin body.

## Responses

### 204 — Sesión revocada

### 401 — Sin token o token inválido

## Notas

- Después del logout, el `refreshToken` y `GET /auth/me` con ese access token
  dejan de funcionar.
- Es idempotente: logout sobre sesión ya revocada no falla.
```

## 95. `documentacion/api/auth/007-get-me.md`

**Ruta:** `documentacion/api/auth/007-get-me.md`

```markdown
# GET /auth/me

> Perfil del usuario autenticado. Exige sesión viva (la fila `refresh_tokens`
> del `sid` debe estar activa) — después de logout devuelve 401 aunque el
> access token no haya expirado.

| | |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/auth/me` |
| **Autenticación** | Bearer requerido |
| **Rol requerido** | — |
| **Rate limit** | global (100/min) |
| **Implementado** | propuesta 002 |

## Request

### Headers
| Header | Requerido |
|--------|-----------|
| `Authorization: Bearer <accessToken>` | sí |

## Responses

### 200 — Perfil
```json
{
  "id": "3f8a0c1e-...",
  "email": "ana@test.com",
  "firstName": "Ana",
  "lastName": "López",
  "phone": null,
  "role": "customer",
  "status": "active",
  "emailVerifiedAt": "2026-01-01T00:00:00.000Z",
  "referralCode": "XK2P9QRD",
  "marketingOptIn": false,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### 401 — Sin token, token inválido o sesión muerta
```json
{ "statusCode": 401, "message": "Session is no longer valid", "timestamp": "..." }
```
```

## 96. `pendientes/002-envio-email-real.md` (archivo nuevo) + README

**Ruta:** `pendientes/002-envio-email-real.md`

```markdown
# Pendiente: Verificar dominio en Resend para emails transaccionales

> **Estado: 🔴 PENDIENTE** — `EmailSenderService` ya envía vía Resend API, pero sin dominio verificado solo puede mandar al email de la propia cuenta.
> **Producto:** backend
> **Bloqueo:** bloqueante

## Estado actual (workaround vigente)

El envío real está implementado (`fetch` a `api.resend.com` con `RESEND_API_KEY`
y `EMAIL_FROM`), pero con la cuenta gratuita **sin dominio verificado**, Resend
solo entrega a la dirección del dueño de la cuenta — los usuarios reales no
reciben códigos. Mientras `RESEND_API_KEY` esté vacío, el servicio cae al
fallback que loguea el código (dev local + e2e por spy).

## Qué falta

- Registrar/verificar un dominio en Resend (DNS: SPF/DKIM) — requiere dominio propio.
- `EMAIL_FROM` con ese dominio (ej. `PCalientes <no-reply@tudominio.com>`).
- `RESEND_API_KEY` de producción en las env vars del entorno real (`env-secrets`).

## Camino de resolución

- Paso de configuración externa, no propuesta de código: el contrato del servicio no cambia.
- Alternativa si no hay dominio propio aún: SMTP transaccional (SendGrid/AWS SES) — cambio acotado al mismo `EmailSenderService`.

## Criterio de cierre

- Un registro real con email ajeno a la cuenta Resend recibe el código de verificación.
```

**`pendientes/README.md`** — agregar fila a la tabla:

```markdown
| 002 | [Envío real de emails](002-envio-email-real.md) | 🔴 PENDIENTE | bloqueante |
```

## Orden de aplicación recomendado

1. `npm install` de las dependencias del paso 64 + generar `JWT_SECRET` en `.env`/`.env.test`.
2. Archivos nuevos en el orden numerado 1 → 57 (controller stub → service stub → DTOs → decoradores → controller completo → mapper → service completo → entidades/enums/excepciones/repositorios-interfaz → services/use-cases de application → migración → schemas → repositorios/servicios/strategy de infra → guards → config → módulo).
3. Actualizaciones a archivos existentes: 58 → 63 (env.validation, app.module, health, .env.example, .env, .env.test) y eliminaciones del paso 65.
4. `npm run migration:run` en dev y `DB_DATABASE=pcalientes_db_test npm run migration:run` en test; `migration:revert` + `run` en test para verificar `down()` (ver `migrations-workflow`).
5. Tests: pasos 66 → 87 (e2e support + specs e2e + specs unitarios).
6. Docs: 88 → 95 y pendiente 96.
7. Verificación: `npm run build`, `npm run lint`, `npm run test`, `npm run test:e2e` en verde.

## Checklist final (propuesta-workflow)

- [x] Módulo de destino: **módulo nuevo `auth`** — bounded context de credenciales/sesiones del modelo aprobado. La entidad `User` vive dentro del módulo (el kernel `identity` solo aparecería con un segundo consumidor real de entidad/repo).
- [x] Orden de archivos según `new-endpoint-checklist` (controller → service → DTOs → use-cases → dominio → persistencia → infra → mapper → módulo).
- [x] `unit-test-checklist`: specs para los 7 use-cases, 2 services de application, 4 repositorios, 4 servicios de infra, mapper, strategy y 2 guards.
- [x] IDOR evaluado (`idor-checklist`): `userId`/`sessionId` siempre del JWT vía `@CurrentUser()` — ningún endpoint recibe id de recurso externo. `verify-email` valida que el token pertenezca al `userId` del email (no se canjea código ajeno). Mass-assignment de `role`/`status` bloqueado por `forbidNonWhitelisted` (cubierto en e2e).
- [x] Sin Swagger decorators en la propuesta (punto 7 de `propuesta-workflow`) — la doc de contrato va en `documentacion/api/`.
- [x] Convenciones: inglés en código, `!` solo para ConfigService, use-cases reciben command objects (nunca el DTO), excepciones de dominio con mensajes en inglés, repos interface+token.





```







---

## Enmiendas post-revisión (aplicadas tras la auditoría del subagente revisor)

El revisor emitió **APROBADO CON OBSERVACIONES** (1 IMPORTANTE, 5 MENOR, 5 INFO).
Correcciones aplicadas directamente sobre la implementación — esta sección es el
registro fiel de lo que difiere del diseño original de la propuesta.

### 1. Ports en `domain/services/` (resuelve el hallazgo IMPORTANTE)

La capa application ya no inyecta clases concretas de infrastructure — aplica el
mismo patrón interface + Symbol token que los repositorios:

| Archivo nuevo | Contenido |
|---|---|
| `domain/services/password-hasher.interface.ts` | `IPasswordHasher` + `PASSWORD_HASHER` |
| `domain/services/code-generator.interface.ts` | `ICodeGenerator` + `CODE_GENERATOR` |
| `domain/services/email-sender.interface.ts` | `IEmailSender` + `EMAIL_SENDER` |

- `PasswordHasherService`, `CodeGeneratorService`, `EmailSenderService` declaran
  `implements I<Port>` y se bindean en `auth.module.ts` con
  `{ provide: TOKEN, useClass: Impl }` (ya no se registran como providers por clase).
- Consumidores (`register`, `login`, `refresh`, `verify-email`, `SessionService`,
  `VerificationCodeService`) inyectan con `@Inject(TOKEN) private readonly x: IPort`.
- Specs actualizan `{ provide: ClassToken }` → `{ provide: SYMBOL_TOKEN }` y el
  tipado de los mocks a las interfaces de dominio.

### 2. Carrera read-check-update en refresh/verify-email (MENOR)

- `IRefreshTokenRepository.revoke` y `IAuthTokenRepository.consume` pasan de
  `Promise<void>` a **`Promise<boolean>`** — el UPDATE ya era condicional
  (`WHERE revoked_at/consumed_at IS NULL`); ahora devuelven `affected > 0`.
- `RefreshUseCase`: `revoke → false` = rotación concurrente → `revokeAllForUser`
  + `CompromisedSessionException` (misma regla que token ya revocado).
- `VerifyEmailUseCase`: `consume → false` → `InvalidAuthCodeException` (genérico).
- Specs nuevos: "carrera de rotación → sesión comprometida",
  "consume sin filas afectadas → código inválido", y aserciones de boolean en
  los specs de repositorio.

### 3. Consistencia schema ↔ migración (MENOR)

- `user.schema.ts`: `email` `varchar(255)` → **`type: 'citext'`**;
  `registeredIp` `varchar(39)` → **`type: 'inet'`** — evita drift si se usa
  `migration:generate` a futuro.

### 4. Command objects explícitos (MENOR)

- `AuthService` mapea DTO → command en los 4 métodos restantes (`verifyEmail`,
  `resendVerification`, `login`, `refresh`); antes pasaba el DTO directo.

### 5. Errores en capa application (MENOR)

- `RegisterUseCase`: `new Error(...)` → **`ReferralCodeGenerationException`**
  (nueva `DomainException` 500 en `domain/exceptions/`).
- `VerificationCodeService.issue`: el envío de email es **best-effort** —
  try/catch + `logger.error`, no propaga. El token queda persistido y el usuario
  puede reintentar por `resend-verification`; además un 500 aquí revelaría que el
  email existe (rompe anti-enumeración). Nuevo dep: `LoggerService`.
- Spec nuevo: "traga el fallo del envío (token persistido, anti-enumeración)".

### 6. Hardening menor (MENOR + INFO)

- `register.dto.ts`: `@Matches(/\S/)` en `firstName` — rechaza strings solo-espacios.
- `email-sender.service.ts`: `signal: AbortSignal.timeout(10_000)` en el fetch a Resend.
- `documentacion/api/auth/002-post-verify-email.md`: nota de que el TTL del código
  es configurable vía `AUTH_CODE_TTL_MINUTES`.

### 7. Dependencias fijadas en majors 11 (resuelto por el implementador)

- `@nestjs/jwt@^11.0.2`, `@nestjs/passport@^11.0.5` — los majors 12 son ESM-only
  y rompen Jest+CJS; los majors 11 tienen API idéntica y peer-compatible con
  `@nestjs/common@11`.

### Verificación post-enmiendas

- `npm run lint` → 0 errores, 0 warnings
- `npm run build` → OK
- `npm run test` → 20/20 suites, **69 tests** (64 originales + 5 nuevos de hardening)
- `npm run test:e2e` → 8/8 suites, 32 tests contra `pcalientes_db_test`

### Hallazgos no corregidos (INFO — decisiones aceptadas)

- `findValidByHash` busca por hash sin userId (colisión teórica ~1e-6: se cura con resend).
- Fallback dev loguea el código a `warn` — deliberado mientras falte `RESEND_API_KEY`.
- `role` stale en el JWT hasta 15 min tras cambio admin — TTL lo acota; `/me` y
  `refresh` verifican estado fresco.
