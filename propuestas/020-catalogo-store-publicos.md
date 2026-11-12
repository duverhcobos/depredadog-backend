# Propuesta: `GET /catalog` y `GET /store/config` públicos

La app va a permitir navegar la carta **sin autenticarse** (propuesta
app `031` — vitrina abierta, auth solo para acciones que la requieran,
decisión del usuario). Hoy **todo** el API va detrás del `JwtAuthGuard`
global (`APP_GUARD`), así que un invitado recibiría 401 hasta para leer
el menú — exactamente lo que la feature quiere eliminar.

Esta propuesta abre **solo los dos GET de lectura pública** que la
vitrina necesita: la carta (`/catalog`) y la info del local
(`/store/config` — el invitado también ve "El local" en su Perfil
limitado: horarios, abierto/cerrado, dirección, teléfono).

Todo lo demás sigue protegido igual: `/orders`, `/addresses`, `/admin`,
`/payments`, `/auth/me`, etc. — nada de esto cambia de matriz.

## Análisis de exposición

- **`GET /catalog`**: es la carta del local — dato diseñado para ser
  visto por cualquiera (precios, nombres, disponibilidad). Cero PII,
  cero lógica de cuenta. Seguro de publicar.
- **`GET /store/config`**: nombre, teléfono, dirección, logo,
  `deliveryFee`, `minDeliveryOrder`, `isOpen`, horarios. Info pública
  de negocio (la misma que iría en una vitrina física o Google Maps).
  El `support_phone` aún no existe (pendiente 012) — cuando llegue se
  evalúa si también es público (probablemente sí: es el WhatsApp de
  soporte que el cliente necesita ver).
- **Rate limiting**: el `ThrottlerGuard` global (100 req/min por IP)
  aplica igual a rutas `@Public` — no se afloja nada. El catálogo es
  lectura pesada-casera (join de categorías+productos+opciones), pero
  100/min sobra para navegación real y frena scraping casual.
- **Caché/carga**: el módulo orders ya hace `refresh()` del catálogo al
  entrar al checkout; hacerlo público no aumenta la carga por sesión,
  solo habilita invitados.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/catalog/presentation/controllers/catalog.controller.ts` | `@Public()` en `getCatalog()` + comentario actualizado |
| `src/modules/store/presentation/controllers/store.controller.ts` | `@Public()` en `getConfig()` + comentario |
| `documentacion/api/catalog.md` | Auth: ninguna |
| `documentacion/api/store-config.md` | Auth: ninguna |
| `test/catalog/*.e2e-spec.ts` | **+ caso** `200 sin Authorization` |
| `test/store/*.e2e-spec.ts` | **+ caso** `200 sin Authorization` |

## Detalle por archivo

### 1. `catalog.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../../common/decorators/public.decorator';
// ...
  // PÚBLICO (§020): la carta es la vitrina — un invitado navega el
  // menú sin cuenta (auth solo para acciones que la requieren).
  // Throttle global 100 req/min aplica igual.
  @Public()
  @Get()
  getCatalog(): Promise<CatalogResponseDto> {
    return this.catalogService.getCatalog();
  }
```

### 2. `store.controller.ts`

```typescript
  // PÚBLICO (§020): horarios/abierto/dirección/teléfono son info de
  // negocio pública — el invitado ve "El local" sin cuenta.
  @Public()
  @Get('config')
  getConfig(): Promise<StoreConfigResponseDto> {
    return this.storeService.getConfig();
  }
```

### 3. Docs (`documentacion/api/`)

En ambas fichas: `Auth: ninguna (endpoint público)` y, si el doc
muestra el header `Authorization: Bearer`, se quita o se marca como
innecesario. El resto del contrato no cambia.

### 4. e2e

Caso nuevo por endpoint — la matriz de auth cambia y hay que fijarla:

```typescript
it('GET /catalog → 200 sin Authorization (público §020)', () =>
  request(app.getHttpServer()).get('/catalog').expect(200));
```

Verificar que ningún spec existente aserte `401` sin token en estos dos
endpoints (si existe, se actualiza al nuevo contrato).

---

## Verificación

- `npm run build` + `npm run test` + `npm run test:e2e`.
- Manual: `curl http://localhost:3000/catalog` y `…/store/config` sin
  header → 200; `GET /orders` sin header → sigue 401.

## Fuera de alcance

- La app (guest mode, muros, `?from=`) — propuesta `031` del repo app,
  ciclo inmediatamente siguiente.
- `support_phone` (pendiente 012) — cuando exista se decide su visibilidad.
- Ningún otro endpoint se evalúa para publicar — la carta y el local
  son los únicos datos de lectura genuinamente públicos del dominio.
