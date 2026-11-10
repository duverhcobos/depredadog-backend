# Propuesta: `errorCode` en respuestas de error de dominio

Los mensajes de `DomainException` llegan al cliente en inglés ("Store is closed", "Invalid credentials") y sin ningún dato machine-readable — la app no puede distinguir **qué** regla de negocio falló dentro de un mismo status (tres razones distintas comparten 409 en `POST /orders`), así que hoy muestra copy genérico en español (decisión §027 tras el hallazgo del revisor).

Esta propuesta agrega `errorCode` — un string `SCREAMING_SNAKE` por excepción de dominio — al body de error, siguiendo el patrón ya usado en otro proyecto del equipo (3TIEMPO). Es **100% aditivo y retrocompatible**: solo aparece cuando la excepción lo define; `HttpException` nativas (401 Unauthorized, arrays de `ValidationPipe`) y errores desconocidos salen sin el campo, como hoy.

Alcance aprobado: **las 21 excepciones de dominio reciben código** (auth incluido — `INVALID_CREDENTIALS` y `EMAIL_ALREADY_REGISTERED` también llegan en inglés a pantallas visibles).

Body resultante:

```json
{ "statusCode": 409, "errorCode": "STORE_CLOSED", "message": "Store is closed", "timestamp": "..." }
```

`message` sigue en inglés — queda para logs/debug; la app consumirá `errorCode` en un ciclo posterior para mapear a copy dedicado en español.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/common/exceptions/domain.exception.ts` | + `readonly errorCode?: string` (param opcional #3) |
| `src/common/filters/handlers/domain-exception.handler.ts` | Emite `errorCode` solo cuando está definido |
| `src/common/filters/handlers/domain-exception.handler.spec.ts` | **Nuevo** — spec del handler (hoy no tiene) |
| 21 × `src/modules/*/domain/exceptions/*.exception.ts` | Cada una pasa su `errorCode` al `super()` |
| `test/**` e2e | Asserts de `errorCode` en casos representativos por módulo |
| `documentacion/api/**` | `errorCode` en los ejemplos de error documentados |
| `.devin/skills/code-patterns/SKILL.md` | Ejemplo de excepción de dominio con `errorCode` |
| `documentacion/modelo-de-datos.md` | Nota en convenciones de errores si existe la sección |

---

## 1. `domain.exception.ts` (archivo existente — actualización)

**Ruta:** `src/common/exceptions/domain.exception.ts`

**Antes:**
```typescript
export abstract class DomainException extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

**Después:**
```typescript
export abstract class DomainException extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number = 400,
    public readonly errorCode?: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

`errorCode` queda **opcional** — excepciones que aún no lo declaren (o futuras provisionales) compilan igual y salen sin el campo.

## 2. `domain-exception.handler.ts` (archivo existente — actualización)

**Ruta:** `src/common/filters/handlers/domain-exception.handler.ts`

**Antes:**
```typescript
    res.status(ex.httpStatus).json({
      statusCode: ex.httpStatus,
      message: ex.message,
      timestamp: new Date().toISOString(),
    });
```

**Después:**
```typescript
    res.status(ex.httpStatus).json({
      statusCode: ex.httpStatus,
      ...(ex.errorCode !== undefined && { errorCode: ex.errorCode }),
      message: ex.message,
      timestamp: new Date().toISOString(),
    });
```

El campo se omite cuando no está definido (convención del proyecto de referencia) — los consumidores hacen `code ?? fallback`.

## 3-23. Las 21 excepciones de dominio (archivos existentes — actualización)

Cada archivo agrega su código como **tercer argumento** del `super()`. El código se deriva del nombre de la excepción (sin prefijo de módulo — el nombre ya es único en el dominio). Ejemplo del cambio (todas son la misma edición de una línea):

**`src/modules/orders/domain/exceptions/store-closed.exception.ts`**

**Antes:**
```typescript
    super('Store is closed', 409);
```

**Después:**
```typescript
    super('Store is closed', 409, 'STORE_CLOSED');
```

Tabla completa archivo → código:

| Archivo (`src/modules/…/domain/exceptions/`) | `errorCode` |
|---|---|
| auth/`address-limit-reached.exception.ts` | `ADDRESS_LIMIT_REACHED` |
| auth/`address-not-found.exception.ts` | `ADDRESS_NOT_FOUND` |
| auth/`compromised-session.exception.ts` | `COMPROMISED_SESSION` |
| auth/`email-already-registered.exception.ts` | `EMAIL_ALREADY_REGISTERED` |
| auth/`email-not-verified.exception.ts` | `EMAIL_NOT_VERIFIED` |
| auth/`google-account-already-linked.exception.ts` | `GOOGLE_ACCOUNT_ALREADY_LINKED` |
| auth/`invalid-auth-code.exception.ts` | `INVALID_AUTH_CODE` |
| auth/`invalid-credentials.exception.ts` | `INVALID_CREDENTIALS` |
| auth/`invalid-google-token.exception.ts` | `INVALID_GOOGLE_TOKEN` |
| auth/`invalid-referral-code.exception.ts` | `INVALID_REFERRAL_CODE` |
| auth/`invalid-refresh-token.exception.ts` | `INVALID_REFRESH_TOKEN` |
| auth/`referral-code-generation.exception.ts` | `REFERRAL_CODE_GENERATION_FAILED` |
| auth/`session-not-found.exception.ts` | `SESSION_NOT_FOUND` |
| auth/`user-suspended.exception.ts` | `USER_SUSPENDED` |
| orders/`invalid-order-data.exception.ts` | `INVALID_ORDER_DATA` |
| orders/`min-order-amount.exception.ts` | `MIN_ORDER_AMOUNT` |
| orders/`order-catalog-violation.exception.ts` | `ORDER_CATALOG_VIOLATION` |
| orders/`order-not-cancellable.exception.ts` | `ORDER_NOT_CANCELLABLE` |
| orders/`order-not-found.exception.ts` | `ORDER_NOT_FOUND` |
| orders/`store-closed.exception.ts` | `STORE_CLOSED` |
| store/`store-not-configured.exception.ts` | `STORE_NOT_CONFIGURED` |

Notas:
- `invalid-order-data` recibe `detail` — el código es fijo: `super(detail, 400, 'INVALID_ORDER_DATA')`.
- `min-order-amount` recibe `min` — el código es fijo: `super(\`Delivery orders require a minimum of ${min}\`, 409, 'MIN_ORDER_AMOUNT')`.
- `order-catalog-violation` recibe `detail` — código fijo `ORDER_CATALOG_VIOLATION`.
- Mensajes y statuses **no cambian** — solo el tercer argumento.

## 24. `domain-exception.handler.spec.ts` (archivo nuevo)

**Ruta:** `src/common/filters/handlers/domain-exception.handler.spec.ts`

El handler no tiene spec hoy — se crea cubriendo: emite `errorCode` cuando la excepción lo trae, lo omite cuando no, status/message/timestamp intactos.

```typescript
import { ArgumentsHost } from '@nestjs/common';
import { DomainException } from '../../exceptions/domain.exception';
import { DomainExceptionHandler } from './domain-exception.handler';

class CodedException extends DomainException {
  constructor() {
    super('Store is closed', 409, 'STORE_CLOSED');
  }
}

class CodelessException extends DomainException {
  constructor() {
    super('Order not found', 404);
  }
}

const host = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status };
  return {
    res,
    json,
    host: {
      switchToHttp: () => ({ getResponse: () => res }),
    } as unknown as ArgumentsHost,
  };
};

describe('DomainExceptionHandler', () => {
  const handler = new DomainExceptionHandler();

  it('emite errorCode cuando la excepción lo define', () => {
    const { host: h, json } = host();
    handler.handle(new CodedException(), h);
    const body = json.mock.calls[0][0];
    expect(body).toMatchObject({
      statusCode: 409,
      errorCode: 'STORE_CLOSED',
      message: 'Store is closed',
    });
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it('omite errorCode cuando la excepción no lo define', () => {
    const { host: h, json } = host();
    handler.handle(new CodelessException(), h);
    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(404);
    expect('errorCode' in body).toBe(false);
  });

  it('canHandle reconoce DomainException y rechaza el resto', () => {
    expect(handler.canHandle(new CodedException())).toBe(true);
    expect(handler.canHandle(new Error('x'))).toBe(false);
  });
});
```

## 25. e2e — asserts de `errorCode` en casos representativos

No se reescriben specs completos: se agregan asserts puntuales donde ya existen los casos de error.

**`test/auth/register.e2e-spec.ts`** — el caso de email duplicado agrega:
```typescript
expect(res.body.errorCode).toBe('EMAIL_ALREADY_REGISTERED');
```

**`test/auth/login.e2e-spec.ts`** — el caso de credenciales inválidas agrega:
```typescript
expect(res.body.errorCode).toBe('INVALID_CREDENTIALS');
```

**`test/auth/addresses.e2e-spec.ts`** — el caso de dirección ajena/ausente (404) agrega:
```typescript
expect(res.body.errorCode).toBe('ADDRESS_NOT_FOUND');
```

**`test/orders/orders.e2e-spec.ts`** — se agregan asserts donde ya hay rechazos cubiertos:
- local cerrado (si el spec ya cubre `StoreClosedException`) → `errorCode: 'STORE_CLOSED'`
- cancelar orden no-pending → `errorCode: 'ORDER_NOT_CANCELLABLE'`
- cancelar orden inexistente/ajena → `errorCode: 'ORDER_NOT_FOUND'`
- violación de catálogo (opción inválida/agotada) → `errorCode: 'ORDER_CATALOG_VIOLATION'`
- pago cash en pickup → `errorCode: 'INVALID_ORDER_DATA'`

**`test/store/store-config.e2e-spec.ts`** — si hay caso sin seed (404) → `errorCode: 'STORE_NOT_CONFIGURED'`; si no existe el caso, no se fuerza.

Además, un assert transversal opcional: en los casos donde el error viene de `HttpException`/guards (401 sin token), `expect(res.body.errorCode).toBeUndefined()` — documenta que el campo no se inventa.

## 26. Documentación de API (archivos existentes — actualización)

En cada doc que muestra ejemplos de error de dominio, el JSON de ejemplo gana `"errorCode"` en su posición (después de `statusCode`). Ejemplo en `documentacion/api/orders/001-post-orders.md`:

**Antes:**
```
{ "statusCode": 409, "message": "Store is closed", "timestamp": "..." }
```

**Después:**
```
{ "statusCode": 409, "errorCode": "STORE_CLOSED", "message": "Store is closed", "timestamp": "..." }
```

Archivos a tocar (los que documentan errores de `DomainException` — los 401 de guard quedan sin el campo):
- `documentacion/api/auth/001-post-register.md` → `EMAIL_ALREADY_REGISTERED`
- `documentacion/api/auth/002-post-verify-email.md` → `INVALID_AUTH_CODE`, `EMAIL_NOT_VERIFIED` (los que aplique)
- `documentacion/api/auth/004-post-login.md` → `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `USER_SUSPENDED` (los que aplique)
- `documentacion/api/auth/005-post-refresh.md` → `INVALID_REFRESH_TOKEN`, `SESSION_NOT_FOUND`, `COMPROMISED_SESSION` (los que aplique)
- `documentacion/api/auth/008-post-forgot-password.md`, `009-post-reset-password.md`, `011-post-check-reset-code.md` → los que aplique (`INVALID_AUTH_CODE`…)
- `documentacion/api/auth/010-post-google.md` → `INVALID_GOOGLE_TOKEN`, `GOOGLE_ACCOUNT_ALREADY_LINKED` (los que aplique)
- `documentacion/api/auth/012-get-addresses.md`, `013-post-addresses.md`, `014-patch-addresses-id.md`, `015-delete-addresses-id.md` → `ADDRESS_NOT_FOUND`, `ADDRESS_LIMIT_REACHED` (los que aplique)
- `documentacion/api/orders/001-post-orders.md` → `STORE_CLOSED`, `MIN_ORDER_AMOUNT`, `ORDER_CATALOG_VIOLATION`, `INVALID_ORDER_DATA`, `ADDRESS_NOT_FOUND`
- `documentacion/api/orders/002-get-orders.md`, `003-get-orders-id.md` → `ORDER_NOT_FOUND` (003)
- `documentacion/api/orders/004-post-orders-id-cancel.md` → `ORDER_NOT_CANCELLABLE`, `ORDER_NOT_FOUND`
- `documentacion/api/store/001-get-store-config.md` → `STORE_NOT_CONFIGURED`
- `documentacion/api/README.md` → nota general: los errores de dominio incluyen `errorCode` opcional machine-readable.

En cada doc se agrega una línea de tabla/nota del código cuando el ejemplo lo muestre — sin reescribir secciones.

## 27. Skill `code-patterns` (archivo existente — actualización)

**Ruta:** `.devin/skills/code-patterns/SKILL.md`

El ejemplo de excepción de dominio se actualiza para incluir el `errorCode` como convención obligatoria en excepciones nuevas:

**Después (fragmento del ejemplo):**
```typescript
export class StoreClosedException extends DomainException {
  constructor() {
    super('Store is closed', 409, 'STORE_CLOSED');
  }
}
```

Con una línea aclarando: el tercer argumento `errorCode` (SCREAMING_SNAKE) es el contrato machine-readable del body de error — toda excepción nueva lo declara.

## 28. `modelo-de-datos.md` (archivo existente — actualización, si aplica)

Si el documento tiene sección de convenciones de errores/API, se anota que el body de error de dominio incluye `errorCode` opcional. Si no tiene esa sección, no se fuerza — la convención ya queda en `documentacion/api/README.md` y `code-patterns`.

---

## Encuesta de revisión (cerrada)

1. **`errorCode` solo cuando está definido** — el campo se omite en HttpException/guards/errores desconocidos (patrón del proyecto de referencia). Aprobado.
2. **Solo `DomainException` recibe código** — los 400 de class-validator y 401 de guard se quedan sin `errorCode`; la app cae al genérico. Aprobado.
3. **Docs: todas las que muestran errores de dominio** (~15 archivos) se actualizan con el `errorCode` real de cada caso. Aprobado.
4. **Códigos sin prefijo de módulo** — `EMAIL_ALREADY_REGISTERED`, `STORE_CLOSED`… el nombre ya es único en el dominio. Aprobado.

---

## Orden de aplicación recomendado

1. `domain.exception.ts` (campo opcional — todo sigue compilando)
2. `domain-exception.handler.ts` (emite el campo)
3. Las 21 excepciones (auth → orders → store, orden alfabético en cada módulo)
4. `domain-exception.handler.spec.ts` (nuevo)
5. Asserts e2e por spec existente
6. Docs `documentacion/api/**` + README
7. `code-patterns` skill + `modelo-de-datos.md` si aplica
8. `npx tsc --noEmit` → `npm run test` → `npm run test:e2e`

Sin migraciones, sin cambios de schema — solo el contrato de error.
