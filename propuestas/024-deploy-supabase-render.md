# Propuesta 024 — Config de producción: SSL a Supabase + deploy en Render

> **Estado: APROBADA** — el usuario pidió el despliegue completo (Supabase + Render + release de la app) en sesión; esta propuesta documenta el cambio de código mínimo que lo habilita.
> **Producto:** backend
> **Pendientes que cierra:** 001 (migrar a Supabase) y 003 (hosting/deploy) — parcial: el cierre total exige la verificación post-deploy.

## Contexto

Producción corre en Render (plan Free por ahora) contra PostgreSQL de Supabase. Dos gaps de código:

1. **Supabase exige SSL** y `database.config.ts`/`typeorm.config.ts` no modelan `ssl` — hoy la conexión saldría en texto plano y Supabase la rechaza.
2. **El repo no tiene remote** — Render despliega desde GitHub; además conviene un `render.yaml` (Blueprint) para que el servicio sea reproducible y no un clic manual irrepetible.

## Cambios de código (mínimos, solo config)

### `src/config/database.config.ts`

Agregar al objeto retornado:

```ts
// SSL — Supabase/prod exige conexión cifrada (DB_SSL=true).
// rejectUnauthorized:false = cifrado sin verificar la CA de Supabase
// (práctica estándar Render+Supabase; el cert CA de Supabase no está en
// el trust store de Node). Cuando se quiera verificación estricta:
// descargar el CA del dashboard Supabase y pasar `ca` aquí (pendiente).
ssl:
  process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
```

### `src/infrastructure/database/database.module.ts`

Pasarlo en el factory: `ssl: config.get('database.ssl')`.

### `typeorm.config.ts` (CLI de migraciones)

Misma línea `ssl` — las migraciones contra Supabase también requieren cifrado.

### `.env.example`

```env
# SSL a la BD — true en producción (Supabase lo exige); false en local
DB_SSL=false
```

Sin variable nueva para `rejectUnauthorized` — MVP toma el valor seguro documentado arriba.

## Deploy (render.yaml en la raíz del backend)

Blueprint de Render — el usuario crea "New > Blueprint Instance" apuntando al repo y solo pega secretos:

```yaml
services:
  - type: web
    name: depredadog-api
    runtime: node
    plan: free
    buildCommand: npm install && npm run build
    startCommand: npm run start:prod
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "3000"
      - key: DB_HOST          # db.<ref>.supabase.co — el usuario lo pega
        sync: false
      - key: DB_PORT
        value: "5432"         # conexión directa MVP (pooler queda en pendientes)
      - key: DB_USERNAME
        value: postgres
      - key: DB_PASSWORD
        sync: false
      - key: DB_DATABASE
        value: postgres       # BD default del proyecto Supabase
      - key: DB_SSL
        value: "true"
      - key: MIGRATIONS_RUN
        value: "false"        # migraciones corren a mano contra Supabase, nunca al boot en prod
      - key: JWT_SECRET
        generateValue: true   # Render genera un secreto aleatorio fuerte
      - key: JWT_ACCESS_TTL
        value: 15m
      - key: JWT_REFRESH_TTL_DAYS
        value: "30"
      - key: AUTH_CODE_TTL_MINUTES
        value: "15"
      - key: CORS_ORIGIN
        value: ""             # API solo-móvil — sin orígenes de navegador
      - key: THROTTLE_TTL
        value: "60"
      - key: THROTTLE_LIMIT
        value: "100"
      - key: LOG_LEVEL
        value: info
      - key: RESEND_API_KEY
        sync: false           # vacío = log fallback (pendiente 002 — registro por email aún no llega en prod)
      - key: EMAIL_FROM
        value: "Depredadog <onboarding@resend.dev>"
      - key: PAYMENT_GATEWAY_DRIVER
        value: sim            # nequi cuando lleguen llaves QA
      - key: PAYMENT_WEBHOOK_SECRET
        generateValue: true
```

### Decisiones tomadas

- **Conexión directa 5432, sin pooler** — una sola instancia web; el pooler (6543) queda documentado para cuando haga falta. Simplifica migraciones y conexión.
- **Migraciones NO al boot** (`MIGRATIONS_RUN=false`): corren desde la máquina de dev con `npm run migration:run` apuntando a Supabase antes de cada deploy que las necesite — igual que los seeds iniciales (`seed:admin`, `seed:catalog`, `seed:store`).
- **`JWT_SECRET` con `generateValue: true`** — Render lo genera; nunca el de dev.
- **Supabase solo como Postgres** — no se adopta Supabase Auth/Storage (decisión del pendiente 001): el módulo auth propio se mantiene.
- **Plan Free** — cold start ~50s tras 15 min sin tráfico; se sube a Starter antes de operar en serio (queda en pendientes/003).
- **Sin RESEND_API_KEY por ahora** — el registro de clientes nuevos no recibirá el código por email en prod hasta cerrar el pendiente 002; se declara vacío y se documenta.

## Verificación

- `npm run build` + `npm run test` verdes con `DB_SSL=false` (local intacto).
- Contra Supabase real: `DB_SSL=true DB_HOST=db.<ref>.supabase.co npm run migration:show` lista migraciones → `migration:run` + seeds.
- Post-deploy: `GET https://<service>.onrender.com/health` → 200; swagger inaccesible en `NODE_ENV=production`.
