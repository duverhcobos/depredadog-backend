---
name: api-docs
description: Convención de documentación por endpoint para consumidores externos — carpeta documentacion/api/, estructura obligatoria de cada archivo, cuándo crearla/actualizarla (misma propuesta que el endpoint)
---

Documentación **para consumidores** (el equipo del frontend, o devs
externos que integren la API) — no para mantenedores del backend. Es la
fuente de verdad del **contrato**: qué se envía, qué se recibe, qué errores
vienen. Vive en `documentacion/api/` — separada de `propuestas/` (diseño
interno) y `planeaciones/` (decisión de negocio).

## Regla madre

**Todo endpoint implementado tiene su doc en `documentacion/api/` en la
misma propuesta/commit que el código.** Un endpoint sin doc es un
endpoint a medio hacer — el checklist de `new-endpoint-checklist` lo
incluye. Si el contrato cambia (campo, status code, validación), el doc
cambia en el mismo commit — nunca "después se actualiza".

## Estructura de la carpeta

```
documentacion/api/
├── README.md                  ← índice de endpoints + convenciones globales
├── auth/
│   ├── 001-post-register.md
│   ├── 002-post-login.md
│   ├── 003-post-refresh.md
│   ├── 004-post-logout.md
│   └── 005-get-me.md
└── <modulo>/                  ← una subcarpeta por módulo de dominio
    └── NNN-<metodo>-<ruta>.md
```

- Numeración **secuencial por módulo** (`auth/001`, `auth/002`...) en el
  orden en que se implementaron — no por prioridad.
- Nombre del archivo: `<metodo>-<ruta-sin-prefijo>` en minúsculas, guiones
  por `/` y `:param` → `id` (`patch-users-id-estado.md`).

## README.md (índice — convenciones globales)

Contiene, una sola vez para todos los endpoints:

- **Base URL** por entorno (`http://localhost:3000` dev).
- **Auth**: `Authorization: Bearer <accessToken>` — cómo se obtiene
  (login/register), duración del access token (24h) y del refresh (7d).
- **Formato de error estándar** de NestJS:
  `{ "statusCode": N, "message": string|string[], "error": string }` —
  `message` es **array** en errores de validación (400).
- **Rate limiting**: límites por endpoint cuando aplique.
- Tabla índice: método + ruta + doc + **estado de integración**:
  `✅ integrado (§NN)` = backend implementado + la app ya lo consume (la
  §NN es la propuesta del proyecto cliente que lo integró) ·
  `🔶 backend listo — sin integrar` = implementado pero la app no lo
  consume · `⬜ pendiente` = ni backend ni app.

## Estructura obligatoria de cada archivo de endpoint

```markdown
# POST /auth/register

> Registra una organización nueva y su usuario administrador en una sola
> operación atómica. Devuelve la sesión lista para usar.

| | |
|---|---|
| **Método** | `POST` |
| **Ruta** | `/auth/register` |
| **Autenticación** | Pública (no requiere token) |
| **Rol requerido** | — |
| **Rate limit** | 3 req/min |
| **Implementado** | propuesta NNN |
| **Integrado en app** | propuesta NNN del cliente |

## Request

### Headers
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| `Content-Type` | sí | `application/json` |

### Body
| Campo | Tipo | Requerido | Validación | Descripción |
|-------|------|-----------|------------|-------------|
| `organizationName` | string | sí | `IsNotEmpty` | Nombre de la la organización (tenant) |
| `name` | string | sí | `IsNotEmpty` | Nombre del administrador |
| `email` | string | sí | `IsEmail` | Único globalmente (case-insensitive) |
| `password` | string | sí | `MinLength(8)` | Se guarda hasheada (bcrypt) |

```json
{
  "organizationName": "Mi Organización",
  "name": "María Gómez",
  "email": "maria@la organización.com",
  "password": "Password1"
}
```

## Responses

### 201 — Creado
```json
{
  "id": "uuid",
  "email": "maria@la organización.com",
  "name": "María Gómez",
  "organizationId": "uuid",
  "organizationName": "Mi Organización",
  "accessToken": "eyJ...",
  "refreshToken": "uuid",
  "createdAt": "2026-09-16T..."
}
```

| Campo | Descripción |
|-------|-------------|
| `accessToken` | JWT 24h — `Authorization: Bearer` en endpoints protegidos. Payload: `sub`, `email`, `organizacionId`, `roles` |
| `refreshToken` | Token opaco 7d — solo para `POST /auth/refresh` |

### 400 — Validación
`message` es array con un string por regla violada.

### 409 — Email ya registrado
Respuesta genérica — no revela en qué organización existe.

## Notas

- La organización queda `active` con `settlement_period_days = 15` (default
  del modelo — configurable luego).
- Si algo falla después de crear la organización, la transacción hace
  rollback completo — nunca queda una org huérfana.
```

## Reglas de contenido

- **JSON real, no esquemas**: los ejemplos son JSON literal tal como sale
  del endpoint (los campos opcionales se omiten si no se devuelven).
- **Todos los status codes posibles** del endpoint, no solo el feliz —
  400/401/403/404/409 según aplique, cada uno con su JSON de ejemplo o la
  tabla de cuándo ocurre.
- **Tabla de campos** debajo de cada JSON cuando el campo no es obvio —
  nunca un JSON sin contexto de qué es cada cosa.
- **Seguridad explícita**: si la respuesta es deliberadamente genérica
  (anti-enumeración), el doc lo dice.
- **Sin secretos ni datos reales** — emails/tokens de ejemplo siempre.
- **Multi-tenant**: si el endpoint filtra por `tenant_id` del JWT,
  el doc lo aclara (el consumidor nunca manda el tenant).

## Cuándo toca escribir/actualizar

- Endpoint nuevo implementado → archivo nuevo + fila en `README.md`.
- Cambio de contrato (campo agregado/renombrado, status nuevo) → update
  del archivo en el mismo commit.
- Endpoint eliminado o deprecado → el archivo se marca `DEPRECATED` en el
  título o se borra + se actualiza el índice.
- El doc se escribe **después** de verificar la respuesta real (los e2e
  son la fuente — copiar los JSONs de lo que el endpoint efectivamente
  devuelve, no de lo que se pretendía).
