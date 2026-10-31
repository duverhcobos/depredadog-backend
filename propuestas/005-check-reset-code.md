# Propuesta: Endpoint `POST /auth/check-reset-code` — chequeo de código de reset SIN consumirlo

Origen: el wizard de recuperación de contraseña de la app tiene 3 pasos
(correo → código → nueva contraseña — decisión del usuario). El paso 2
necesita validar el código ANTES de pedir la clave. Hoy solo existe
`reset-password`, que valida código+clave juntos y consume el token en el
mismo paso — no permite verificar por separado.

Este endpoint valida `{email, code}` contra `auth_tokens`
(`PASSWORD_RESET`) con la MISMA cadena de chequeos que
`ResetPasswordUseCase` pero **sin `consume()`** — el código queda vivo
hasta el reset real, que lo revalida y consume atómicamente. La carrera
código-expira-entre-chequeo-y-reset queda cubierta: `reset-password`
responde 400 y la app devuelve al usuario al paso del código.

## Decisiones de diseño

- **Ruta**: `check-reset-code` — decisión del usuario: es un chequeo,
  no una verificación que consume (vs. `verify-email` que sí consume).
- **Respuesta**: `MessageResponseDto` genérico (patrón de
  forgot/resend), NO booleano — el 200 significa "válido", el 400 es
  `InvalidAuthCodeException` único para TODOS los fallos (usuario
  inexistente, suspendido, código errado/expirado) — no revela qué falló.
- **No consume**: `findValidByHash` + chequeos, nunca `consume()` — si
  consumiera, `reset-password` fallaría después.
- **Throttle**: `5/min` — igual que `reset-password`/`verify-email` (la
  defensa real contra fuerza bruta es la expiración + uso único del
  código de 6 dígitos: a 5/min el espacio de 1M toma ~139 días).
- **Sin fingerprint/platform**: no emite sesión — body mínimo
  `{email, code}`.
- **IDOR**: no aplica — recibe email+código (credenciales de la
  operación), no identificador de recurso ajeno.
- **Fuera de alcance** (confirmado con el usuario): emitir un
  "reset-token" firmado que `reset-password` exigiera en vez del código —
  más seguro pero cambia el contrato de reset y agrega un segundo
  artefacto efímero; el chequeo simple reutiliza la revalidación que el
  reset ya hace.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/application/dtos/check-reset-code.dto.ts` | nuevo — `{email, code}` |
| `src/modules/auth/application/use-cases/check-reset-code.use-case.ts` | nuevo — valida sin consumir |
| `src/modules/auth/application/use-cases/check-reset-code.use-case.spec.ts` | nuevo — spec unitario |
| `src/modules/auth/application/services/auth.service.ts` | agrega método `checkResetCode` |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | agrega ruta + import del DTO |
| `src/modules/auth/auth.module.ts` | registra el use case |
| `test/auth/check-reset-code.e2e-spec.ts` | nuevo — spec e2e |
| `documentacion/api/auth/011-post-check-reset-code.md` | nuevo — doc del contrato |

---

## 1. `check-reset-code.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/check-reset-code.dto.ts`

```typescript
import { IsEmail, IsString, Matches } from 'class-validator';

export class CheckResetCodeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;
}
```

## 2. `check-reset-code.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/check-reset-code.use-case.ts`

Misma cadena de validación que `ResetPasswordUseCase` líneas 50-67,
sin `consume()`/`hash`/`save`/`revokeAllForUser`/`issue`:

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
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  CODE_GENERATOR,
  type ICodeGenerator,
} from '../../domain/services/code-generator.interface';

export interface CheckResetCodeCommand {
  email: string;
  code: string;
}

/// Valida un código de reset SIN consumirlo — el paso intermedio del
/// wizard de recuperación ("se verifica" antes de pedir la clave).
/// ResetPasswordUseCase sigue siendo el único que consume el token;
/// si el código expira entre este chequeo y el reset, el reset falla
/// con el mismo 400 genérico y el flujo reintenta.
@Injectable()
export class CheckResetCodeUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(AUTH_TOKEN_REPOSITORY)
    private readonly authTokens: IAuthTokenRepository,
    @Inject(CODE_GENERATOR)
    private readonly codeGenerator: ICodeGenerator,
  ) {}

  async execute(cmd: CheckResetCodeCommand): Promise<void> {
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
  }
}
```

## 3. `check-reset-code.use-case.spec.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/check-reset-code.use-case.spec.ts`

Cubre (espejo del spec de reset-password, acotado a validación):

- código válido → resuelve sin error, `consume` NUNCA se llama
- usuario inexistente → `InvalidAuthCodeException`
- usuario suspendido → `InvalidAuthCodeException`
- código errado (`findValidByHash` → null) → `InvalidAuthCodeException`
- token de OTRO usuario → `InvalidAuthCodeException`
- token expirado → `InvalidAuthCodeException`
- email con mayúsculas/espacios se normaliza (`trim().toLowerCase()`)

## 4. `auth.service.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

**Antes** (imports, ~línea 15):

```typescript
import { ResetPasswordDto } from '../dtos/reset-password.dto';
```

**Después:**

```typescript
import { ResetPasswordDto } from '../dtos/reset-password.dto';
import { CheckResetCodeDto } from '../dtos/check-reset-code.dto';
```

**Antes** (constantes, línea 28):

```typescript
const GENERIC_FORGOT_MESSAGE =
  'If that email is registered, a reset code has been sent.';
```

**Después:**

```typescript
const GENERIC_FORGOT_MESSAGE =
  'If that email is registered, a reset code has been sent.';
const GENERIC_CODE_OK_MESSAGE = 'Reset code is valid.';
```

**Antes** (método `resetPassword`, líneas 113-123):

```typescript
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
```

**Después** (se agrega `checkResetCode` después de `resetPassword`):

```typescript
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
```

Y en el constructor de `AuthService` se inyecta
`private readonly checkResetCodeUseCase: CheckResetCodeUseCase`
(con su import), junto a `resetPasswordUseCase`.

## 5. `auth.controller.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

**Antes** (línea 15):

```typescript
import { ResetPasswordDto } from '../../application/dtos/reset-password.dto';
```

**Después:**

```typescript
import { ResetPasswordDto } from '../../application/dtos/reset-password.dto';
import { CheckResetCodeDto } from '../../application/dtos/check-reset-code.dto';
```

**Antes** (ruta `reset-password`, líneas 70-76):

```typescript
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
```

**Después** (se agrega la ruta DESPUÉS de `reset-password`, junto a su
familia de recuperación):

```typescript
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
```

## 6. `auth.module.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/auth.module.ts`

**Antes** (providers, ~línea 77):

```typescript
    ResetPasswordUseCase,
```

**Después:**

```typescript
    ResetPasswordUseCase,
    CheckResetCodeUseCase,
```

+ el `import` correspondiente junto al de `ResetPasswordUseCase`.

## 7. `check-reset-code.e2e-spec.ts` (archivo nuevo)

**Ruta:** `test/auth/check-reset-code.e2e-spec.ts`

Mismo skeleton que `reset-password.e2e-spec.ts` (createE2EApp,
cleanAuthTables, restoreThrottler, helper `requestReset` que llama
`/auth/forgot-password` y lee `lastCodeFor(email, 'password_reset')`).
Casos:

- código válido → 200 con `message`
- **el código sigue vivo tras el chequeo** → 200 en check y luego 200
  en `reset-password` con el MISMO código (la clave del endpoint)
- código errado → 400
- código expirado/usado → 400 (reset realizado antes → check falla)
- `code` no-numérico o de largo ≠ 6 → 400 del pipe
- email inexistente → 400 (mismo genérico — no revela)

## 8. `011-post-check-reset-code.md` (archivo nuevo)

**Ruta:** `documentacion/api/auth/011-post-check-reset-code.md`

Doc del contrato al estilo de `009-post-reset-password.md`:
request `{email, code}` → 200 `{message}` · 400 genérico código
inválido/expirado · 429 throttle · nota "no consume el código —
`reset-password` lo revalida y consume".

---

## Orden de aplicación recomendado

1. `check-reset-code.dto.ts`
2. `check-reset-code.use-case.ts`
3. `auth.service.ts` (import + constante + inyección + método)
4. `auth.controller.ts` (import + ruta)
5. `auth.module.ts` (provider)
6. `check-reset-code.use-case.spec.ts`
7. `check-reset-code.e2e-spec.ts`
8. `documentacion/api/auth/011-post-check-reset-code.md`

Verificación: `npm run build` + `npm run test` + `npm run test:e2e`
(suite auth completa — el endpoint nuevo no debe romper los specs
existentes de reset/forgot).
