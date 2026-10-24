---
name: code-patterns
description: Patrones de código recurrentes de este backend NestJS — excepciones de dominio, repositorio interface+token, puertos de servicio en domain, consumo atómico de tokens, constraints PG→DomainException, JWT payload, guard público, throttling, graceful shutdown
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Patrones de código clave de este backend. Usar estos ejemplos como referencia exacta al escribir código nuevo — no inventar variantes propias.

### Excepciones de dominio

```typescript
// Todas las excepciones heredan de DomainException en src/common/exceptions/
export class XxxException extends DomainException {
    constructor() { super('mensaje', 409); }
}
// El DomainExceptionFilter global las captura y responde { statusCode, message, timestamp }
```

### Repositorio: interface + token

```typescript
// En domain/repositories/
export interface IXxxRepository { ... }
export const XXX_REPOSITORY = Symbol('IXxxRepository');

// En módulo:
{ provide: XXX_REPOSITORY, useClass: XxxRepository }

// En use-case:
constructor(@Inject(XXX_REPOSITORY) private readonly repo: IXxxRepository) {}
```

### Puertos de servicio en domain (servicios externos)

```typescript
// Servicios técnicos que el use-case necesita (hash, email, generador de
// códigos, verificador de tokens externos) siguen el MISMO patrón que los
// repositorios: interface + Symbol token en domain/services/, impl en
// infrastructure/services/. application/ nunca importa la clase concreta
// de infra — el swap de proveedor (Resend→SES, bcrypt→argon2) queda en un
// binding del módulo.
// Ejemplos reales en auth: IPasswordHasher, ICodeGenerator, IEmailSender,
// IGoogleTokenVerifier.
export interface IXxxService { ... }
export const XXX_SERVICE = Symbol('IXxxService');
{ provide: XXX_SERVICE, useClass: XxxServiceImpl }
```

### Consumo/revocación atómica (tokens de un solo uso)

```typescript
// NUNCA read-check-write para consumir/revocar un token: dos requests
// concurrentes pasarían el check leyendo el mismo estado. UPDATE condicional
// y verificar affected:
const result = await repo.update(
  { id: token.id, consumedAt: IsNull() },
  { consumedAt: new Date() },
);
// affected === 0 → otro request ya lo consumió → tratar como REUSO
// (en auth: CompromisedSessionException + revokeAllForUser del dueño).
// Las interfaces devuelven Promise<boolean> (filas afectadas), no void.
```

### Constraints de PostgreSQL → DomainException

```typescript
// Los unique constraints pueden violarse en carrera aunque el use-case
// chequeó antes (register duplicado, link concurrente de Google). Mapear el
// QueryFailedError 23505 en el repositorio a la DomainException del caso —
// nunca dejar que llegue cruda como 500:
try { await this.orm.save(schema); }
catch (e) {
  if (e instanceof QueryFailedError &&
      (e.driverError as { constraint?: string }).constraint === 'uq_xxx') {
    throw new XxxAlreadyExistsException();
  }
  throw e;
}
```

### JWT payload con contexto (implementado en módulo auth — single-tenant hoy)

```typescript
// jwt.strategy.ts — JwtPayload mínimo: { sub, sid, email }.
// Si el producto es multi-tenant, el contexto activo (organizationId/roles)
// viaja en el propio JWT: evita una query extra por request a costa de quedar
// "stale" hasta el próximo login/refresh si cambian — aceptable con el TTL
// corto del access token. `sid` liga el JWT a la fila exacta de su sesión
// (permite revocar sesiones y exigir sesión viva en /auth/me).
//
// jwt.strategy.ts:validate(payload) devuelve
//   { userId: payload.sub, sessionId: payload.sid, email: payload.email, ...ctx }
// CurrentUser decorator (presentation/decorators/current-user.decorator.ts) extrae request.user
// Uso en controller: @CurrentUser() user: { userId: string; sessionId?: string; ... }
```

### Token sin contexto vs. con contexto (multi-tenant)

```typescript
// Si el producto permite pertenecer a varias organizaciones/tenants, se emiten
// DOS tipos de access token con el mismo JwtService:
//
//   PERSONAL      { sub, sid, email }                          — SIN tenant ni roles.
//   Tenant-scoped { sub, sid, email, organizationId, roles }   — con contexto.
//
// El personal lo emiten register/login/refresh (sesión con organization_id
// NULL); el scoped solo el endpoint de "elegir organización" y refresh sobre
// sesión scoped.
//
// INVARIANTE OBLIGATORIO — todo endpoint de datos de tenant debe ir detrás
// de @UseGuards(RolesGuard) + @Roles(...) y/o exigir
// tenantContext.requireOrganizationId() en el use-case/repositorio. Un
// endpoint scoped sin @Roles dejaría pasar el token personal (que viene sin
// roles ni organizationId) — es la única puerta de IDOR que el modelo no
// cierra solo (ver skill idor-checklist).
```

### Guard global + rutas públicas

```typescript
// JwtAuthGuard registrado como APP_GUARD global (protege TODAS las rutas por
// defecto). Chequea @Public() (SetMetadata IS_PUBLIC_KEY) y si no es pública
// delega a super.canActivate() (passport-jwt).
// Para rutas sin auth: @Public() en el handler/controller.
```

### Contexto de tenant (`src/common/tenant/`)

```typescript
// TenantContextService (AsyncLocalStorage) + TenantContextInterceptor global.
// Puebla userId/organizationId/roles una vez por request a partir de
// request.user — corre siempre DESPUÉS de todos los guards (Guards →
// Interceptors, ciclo de vida de Nest), así que request.user ya está resuelto
// sin condiciones de carrera entre módulos.
//
// Uso en un use-case/repositorio (sin pasar organizationId manualmente):
constructor(private readonly tenantContext: TenantContextService) {}
async execute() {
  const organizationId = this.tenantContext.requireOrganizationId(); // lanza si no hay contexto
  // ...WHERE organizationId = organizationId (ver skill idor-checklist)
}
```

### RBAC (`@Roles()` + `RolesGuard`)

```typescript
// src/common/decorators/roles.decorator.ts + src/common/guards/roles.guard.ts
// Opt-in por ruta (NO global, a diferencia de JwtAuthGuard) — así se garantiza
// que corre después del guard de JWT sin depender del orden de registro entre
// módulos (Nest ejecuta guards globales antes que los de @UseGuards()).
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Post('users')
inviteUser() { ... }
// Sin @Roles() en la ruta, RolesGuard no restringe nada.
```

### Schema TypeORM

```typescript
// src/infrastructure/database/schemas/<entidad>.schema.ts
// Una clase EntitySchema por tabla — nombres de tabla/columna en inglés
// snake_case plural (ver skill migrations-workflow). Relaciones inversas
// declaradas pero cargadas solo vía join explícito (nunca eager global).
```

### Throttling por ruta

```typescript
@Throttle({ default: { limit: 5, ttl: 60000 } })  // 5 req / 60s
```

### Graceful shutdown de recursos externos

```typescript
// main.ts debe llamar a app.enableShutdownHooks().
// TypeOrmModule implementa OnApplicationShutdown internamente — el pool de
// Postgres se cierra solo, sin código adicional.
//
// Si un módulo nuevo agrega un provider que gestiona una conexión/handle propio
// (cliente Redis, conexión a un broker de mensajes/colas, WebSocket gateway,
// cron/interval manual con setInterval, etc.), ese provider DEBE implementar
// OnApplicationShutdown para liberar el recurso al recibir SIGTERM/SIGINT/SIGHUP:
export class SomeExternalResourceService implements OnApplicationShutdown {
  onApplicationShutdown(signal?: string) {
    // cerrar conexión, limpiar timers, etc.
  }
}
```
