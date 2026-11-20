# Propuesta: endpoints de perfil — `PATCH /auth/me` + `POST /auth/change-password`

Cierra el pendiente 013: el tab Perfil de la app (§030.1) maqueta
"Mis datos" y "Cambiar contraseña" con mocks y no tiene contrato
backend. `GET /auth/me` y `POST /auth/logout` ya existen — lo que
falta es la escritura parcial del propio usuario y el cambio de
contraseña con verificación de la actual.

**Alcance**: 2 endpoints autenticados bajo `/auth/*` + DTOs + 2
use-cases + 1 excepción de dominio + método de repo para revocar
sesiones ajenas + docs + specs. Fuera: cambio de email (requeriría
re-verificación — endpoint aparte si se pide), avatar/foto,
preferencias de marketing (el campo `marketingOptIn` existe pero la
app no lo expone todavía — se documenta como no editable aquí).

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/presentation/controllers/auth.controller.ts` | +`PATCH /auth/me` y `POST /auth/change-password` |
| `src/modules/auth/application/dtos/update-profile.dto.ts` | nuevo — campos parciales |
| `src/modules/auth/application/dtos/change-password.dto.ts` | nuevo — actual + nueva |
| `src/modules/auth/application/use-cases/update-profile.use-case.ts` | nuevo |
| `src/modules/auth/application/use-cases/change-password.use-case.ts` | nuevo |
| `src/modules/auth/domain/exceptions/password-not-set.exception.ts` | nuevo — cuentas Google sin contraseña |
| `src/modules/auth/domain/exceptions/invalid-profile-field.exception.ts` | nuevo — null en campo requerido |
| `src/modules/auth/domain/repositories/refresh-token.repository.interface.ts` | +`revokeAllForUserExcept` |
| `src/modules/auth/infrastructure/repositories/refresh-token.repository.ts` | implementa `revokeAllForUserExcept` |
| `src/modules/auth/application/services/auth.service.ts` | +`updateMe` + `changePassword` |
| `src/modules/auth/auth.module.ts` | registra los 2 use-cases |
| `documentacion/api/auth/011-patch-me.md` | nuevo — contrato PATCH |
| `documentacion/api/auth/012-post-change-password.md` | nuevo — contrato change-password |
| `test/auth/patch-me.e2e-spec.ts` | nuevo — e2e PATCH /auth/me |
| `test/auth/change-password.e2e-spec.ts` | nuevo — e2e change-password |
| `src/modules/auth/application/use-cases/update-profile.use-case.spec.ts` | nuevo — unitario |
| `src/modules/auth/application/use-cases/change-password.use-case.spec.ts` | nuevo — unitario |
| `src/modules/auth/infrastructure/repositories/refresh-token.repository.spec.ts` | +caso `revokeAllForUserExcept` |
| `pendientes/013-auth-perfil-endpoints.md` | estado → resuelto |

---

## 1. auth.controller.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

Los dos endpoints nuevos van al final, después de `me()`. Requieren
sesión (sin `@Public()`); `change-password` lleva `@Throttle` porque
verifica la contraseña actual — es superficie de fuerza bruta.

**Antes:**
```typescript
import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
```
```typescript
import { GoogleLoginDto } from '../../application/dtos/google-login.dto';
```
```typescript
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.userId, user.sessionId);
  }
}
```

**Después:**
```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Patch,
  Post,
} from '@nestjs/common';
```
```typescript
import { GoogleLoginDto } from '../../application/dtos/google-login.dto';
import { UpdateProfileDto } from '../../application/dtos/update-profile.dto';
import { ChangePasswordDto } from '../../application/dtos/change-password.dto';
```
```typescript
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.userId, user.sessionId);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateMe(user.userId, user.sessionId, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  @HttpCode(204)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      user.userId,
      user.sessionId,
      dto,
    );
  }
}
```

## 2. update-profile.dto.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/update-profile.dto.ts`

PATCH parcial: los campos ausentes (`undefined`) no se tocan; los
nullable (`secondName`, `secondLastName`, `phone`) aceptan `null`
explícito para borrarse — `@IsOptional()` deja pasar `null` sin
validar y el use-case distingue `undefined` de `null`. Los
requeridos (`firstName`, `firstLastName`) también pasan `null` sin
validación — el use-case los rechaza con `InvalidProfileFieldException`.

```typescript
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

// PATCH parcial: undefined = no tocar, null = borrar (solo nullable),
// string = asignar. Los requeridos rechazan null en el use-case.
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Matches(/\S/)
  firstName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  secondName?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Matches(/\S/)
  firstLastName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  secondLastName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;
}
```

## 3. change-password.dto.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/change-password.dto.ts`

Misma regla de longitud que `RegisterDto.password` (8–72 — límite
superior por bcrypt).

```typescript
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
```

## 4. password-not-set.exception.ts (archivo nuevo)

**Ruta:** `src/modules/auth/domain/exceptions/password-not-set.exception.ts`

Cuentas creadas solo con Google (`passwordHash = null`) no tienen
"contraseña actual" que verificar. Error dedicado para que la app
diga "tu cuenta usa Google — crea una contraseña desde recuperar"
en lugar de un genérico engañoso. El usuario ya está autenticado:
no hay fuga de información.

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class PasswordNotSetException extends DomainException {
  constructor() {
    super('Account has no password', 400, 'PASSWORD_NOT_SET');
  }
}
```

## 5. invalid-profile-field.exception.ts (archivo nuevo)

**Ruta:** `src/modules/auth/domain/exceptions/invalid-profile-field.exception.ts`

`null` explícito en un campo requerido (`firstName`,
`firstLastName`) no se puede "borrar" — 400 dedicado.

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidProfileFieldException extends DomainException {
  constructor(field: string) {
    super(`${field} cannot be cleared`, 400, 'INVALID_PROFILE_FIELD');
  }
}
```

## 6. update-profile.use-case.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/update-profile.use-case.ts`

Replica la guarda de `GetMeUseCase` (usuario ACTIVE + sesión viva) —
una escritura exige la misma sesión que la lectura. IDOR: imposible
por diseño, el `userId` sale del JWT.

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { InvalidProfileFieldException } from '../../domain/exceptions/invalid-profile-field.exception';
import { SessionNotFoundException } from '../../domain/exceptions/session-not-found.exception';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';

export interface UpdateProfileCommand {
  userId: string;
  sessionId: string;
  firstName?: string | null;
  secondName?: string | null;
  firstLastName?: string | null;
  secondLastName?: string | null;
  phone?: string | null;
}

@Injectable()
export class UpdateProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: IRefreshTokenRepository,
  ) {}

  async execute(cmd: UpdateProfileCommand): Promise<User> {
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

    if (cmd.firstName !== undefined) {
      if (cmd.firstName === null) {
        throw new InvalidProfileFieldException('firstName');
      }
      user.firstName = cmd.firstName;
    }
    if (cmd.firstLastName !== undefined) {
      if (cmd.firstLastName === null) {
        throw new InvalidProfileFieldException('firstLastName');
      }
      user.firstLastName = cmd.firstLastName;
    }
    if (cmd.secondName !== undefined) {
      user.secondName = cmd.secondName;
    }
    if (cmd.secondLastName !== undefined) {
      user.secondLastName = cmd.secondLastName;
    }
    if (cmd.phone !== undefined) {
      user.phone = cmd.phone;
    }
    return this.users.save(user);
  }
}
```

## 7. refresh-token.repository.interface.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/domain/repositories/refresh-token.repository.interface.ts`

`change-password` revoca las sesiones de **otros** dispositivos pero
deja viva la actual — medida de seguridad sin sacar al usuario de su
propio teléfono.

**Antes:**
```typescript
  revoke(id: string): Promise<boolean>;
  revokeAllForUser(userId: string): Promise<void>;
}
```

**Después:**
```typescript
  revoke(id: string): Promise<boolean>;
  revokeAllForUser(userId: string): Promise<void>;
  /** Revoca todas las sesiones del usuario salvo `exceptId` — cambio de contraseña. */
  revokeAllForUserExcept(userId: string, exceptId: string): Promise<void>;
}
```

## 8. refresh-token.repository.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/infrastructure/repositories/refresh-token.repository.ts`

**Antes:**
```typescript
  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
```

**Después:**
```typescript
  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async revokeAllForUserExcept(
    userId: string,
    exceptId: string,
  ): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('id != :exceptId', { exceptId })
      .andWhere('revoked_at IS NULL')
      .execute();
  }
```

## 9. change-password.use-case.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/change-password.use-case.ts`

Verifica la actual contra el hash → `InvalidCredentialsException`
(401 genérico, mismo que login — no revela cuál falló). Si la cuenta
no tiene contraseña (solo Google) → `PasswordNotSetException`. Tras
re-hashear: `revokeAllForUserExcept` mata todas las sesiones ajenas;
la actual sobrevive con su refresh token. Respuesta: nada (204).

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';
import { PasswordNotSetException } from '../../domain/exceptions/password-not-set.exception';
import { SessionNotFoundException } from '../../domain/exceptions/session-not-found.exception';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  type IPasswordHasher,
  PASSWORD_HASHER,
} from '../../domain/services/password-hasher.interface';

export interface ChangePasswordCommand {
  userId: string;
  sessionId: string;
  currentPassword: string;
  newPassword: string;
}

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: IRefreshTokenRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
  ) {}

  async execute(cmd: ChangePasswordCommand): Promise<void> {
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

    if (!user.passwordHash) {
      throw new PasswordNotSetException();
    }
    const matches = await this.passwordHasher.verify(
      user.passwordHash,
      cmd.currentPassword,
    );
    if (!matches) throw new InvalidCredentialsException();

    user.passwordHash = await this.passwordHasher.hash(cmd.newPassword);
    await this.users.save(user);
    // Seguridad post-cambio de credencial: mueren las sesiones ajenas.
    await this.refreshTokens.revokeAllForUserExcept(
      user.id,
      cmd.sessionId,
    );
  }
}
```

## 10. auth.service.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

**Antes:**
```typescript
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getMeUseCase: GetMeUseCase,
```
```typescript
  async me(userId: string, sessionId: string): Promise<UserResponseDto> {
    const user = await this.getMeUseCase.execute({ userId, sessionId });
    return this.authMapper.toUserResponse(user);
  }
```

**Después:**
```typescript
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getMeUseCase: GetMeUseCase,
    private readonly updateProfileUseCase: UpdateProfileUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
```
```typescript
  async me(userId: string, sessionId: string): Promise<UserResponseDto> {
    const user = await this.getMeUseCase.execute({ userId, sessionId });
    return this.authMapper.toUserResponse(user);
  }

  async updateMe(
    userId: string,
    sessionId: string,
    dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.updateProfileUseCase.execute({
      userId,
      sessionId,
      ...dto,
    });
    return this.authMapper.toUserResponse(user);
  }

  async changePassword(
    userId: string,
    sessionId: string,
    dto: ChangePasswordDto,
  ): Promise<void> {
    await this.changePasswordUseCase.execute({
      userId,
      sessionId,
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
    });
  }
```

(con sus imports `UpdateProfileDto`, `ChangePasswordDto`,
`UpdateProfileUseCase`, `ChangePasswordUseCase`)

## 11. auth.module.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/auth.module.ts`

**Antes:**
```typescript
    LogoutUseCase,
    GetMeUseCase,
```

**Después:**
```typescript
    LogoutUseCase,
    GetMeUseCase,
    UpdateProfileUseCase,
    ChangePasswordUseCase,
```

## 12. documentacion/api/auth/011-patch-me.md (archivo nuevo)

Contrato `PATCH /auth/me`: auth requerida, body parcial con los 5
campos, semántica `undefined`/`null`, respuesta 200 = `UserResponseDto`
completo, errores 400 `INVALID_PROFILE_FIELD` / 401 / 429.

## 13. documentacion/api/auth/012-post-change-password.md (archivo nuevo)

Contrato `POST /auth/change-password`: auth requerida, body
`currentPassword` + `newPassword`, 204 sin body, errores 400
`PASSWORD_NOT_SET` / 401 `INVALID_CREDENTIALS` / 429, y la nota
explícita de que las demás sesiones del usuario quedan revocadas.

## 14. patch-me.e2e-spec.ts (archivo nuevo)

**Ruta:** `test/auth/patch-me.e2e-spec.ts`

Casos: 200 parcial (solo `phone` → nombres intactos), 200 con `null`
en `secondName` (queda `null`), 400 `INVALID_PROFILE_FIELD` con
`firstName: null`, 400 por `firstName: "   "` (`@Matches(/\S/)`),
400 `secondName` > 100 chars, 401 sin token.

## 15. change-password.e2e-spec.ts (archivo nuevo)

**Ruta:** `test/auth/change-password.e2e-spec.ts`

Casos: 204 happy path (login posterior con la nueva funciona, la
vieja da `INVALID_CREDENTIALS`), 401 `INVALID_CREDENTIALS` con
`currentPassword` mala, 400 `PASSWORD_NOT_SET` en cuenta Google,
400 `newPassword` < 8, **la sesión actual sigue viva tras el cambio**
(segundo request autenticado pasa) y **una segunda sesión del mismo
usuario queda revocada** (su refresh da 401).

## 16. update-profile.use-case.spec.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/update-profile.use-case.spec.ts`

Repos mockeados. Casos: patch parcial, `null` borra nullable, `null`
en requerido → `InvalidProfileFieldException`, `SessionNotFound`
(usuario inexistente/suspendido, sesión revocada/expirada/ajena),
campos ausentes intactos.

## 17. change-password.use-case.spec.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/change-password.use-case.spec.ts`

Repos + hasher mockeados. Casos: happy path (verify ok → hash → save
→ `revokeAllForUserExcept` con el sessionId actual), `passwordHash`
null → `PasswordNotSetException`, verify false →
`InvalidCredentialsException`, `SessionNotFound` en las 4 variantes.

## 18. refresh-token.repository.spec.ts (archivo existente — actualización)

Agregar caso `revokeAllForUserExcept`: revoca las demás y respeta
`exceptId` (WHERE `id != exceptId` + `revoked_at IS NULL`).

## 19. pendientes/013-auth-perfil-endpoints.md (archivo existente — actualización)

Estado → `✅ RESUELTO (propuesta 021)` con la fecha y la nota de la
decisión de sesiones.

---

## Orden de aplicación recomendado

1. `auth.controller.ts` (2 endpoints — referencian DTOs y service)
2. `update-profile.dto.ts` + `change-password.dto.ts`
3. `password-not-set.exception.ts` + `invalid-profile-field.exception.ts`
4. `refresh-token.repository.interface.ts` + `refresh-token.repository.ts`
5. `update-profile.use-case.ts` + `change-password.use-case.ts`
6. `auth.service.ts`
7. `auth.module.ts`
8. `documentacion/api/auth/011-patch-me.md` + `012-post-change-password.md`
9. Specs unitarios + repo spec
10. `patch-me.e2e-spec.ts` + `change-password.e2e-spec.ts`
11. `pendientes/013` → resuelto
