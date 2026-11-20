# Pendiente: Hosting, dominio y deploy del backend a producción

> **Estado: 🟡 PARCIAL (2026-11-20)** — `depredadog-api` LIVE en Render (**https://depredadog-api.onrender.com**, plan **Free**, Blueprint desde `render.yaml` en repo, auto-deploy por push a `main`). Verificado: `/health` → db:up, swagger off en prod, `/catalog` con datos reales, login admin OK.
> **Lo que queda:** subir a **Starter ($7/mes)** antes de operar en serio (free duerme a los 15 min — cold start ~50s); dominio propio opcional; `RESEND_API_KEY` real (pendiente 002); migraciones corren A MANO contra Supabase (`source .env.supabase.local && npm run migration:run`) — `MIGRATIONS_RUN=false` en prod.
> **Producto:** backend
> **Bloqueo:** bloqueante — sin backend público no hay app en producción; también bloquea `API_BASE_URL` de prod en la app

## Contexto

Todo el desarrollo corre contra `localhost:3000` (emulador: `10.0.2.2:3000`). Para producción hace falta decidir y montar el hosting real. La base de datos ya tiene su propio pendiente (001 — Supabase).

## Qué falta

- **Elegir hosting** — opciones típicas para NestJS+PG: Railway, Render, Fly.io, o un VPS. Criterio: costo para MVP, despliegue desde git, regiones LATAM.
- **Dominio + HTTPS** — la app de producción debe pegar por `https://`; Android bloquea cleartext en release. Decidir `api.depredadog.com` o subdominio del hosting.
- **Variables de entorno de prod** — las de `.env` hoy son de dev. Prod necesita valores nuevos: `NODE_ENV=production`, `JWT_SECRET` real (rotado, el de dev no sirve), credenciales DB de Supabase (ídem 001), `GOOGLE_CLIENT_IDS`, `RESEND_API_KEY` real (ídem 002), `CORS_ORIGIN` (app móvil → probablemente no haga falta origen, revisar), `THROTTLE_*` finales.
- **Estrategia de migraciones en deploy** — `MIGRATIONS_RUN` + paso de `typeorm migration:run` en el arranque o pipeline; nunca `DB_SYNCHRONIZE=true` en prod.
- **Verificación post-deploy** — `/health` respondiendo, swagger apagado (ya es condicional a `isProduction` — validar que `NODE_ENV=production` lo apaga realmente).
- **Monitoreo/logs** — decidir dónde viven los logs (`LOG_DIR`/`LOG_LEVEL` ya parametrizados) y si se suma un servicio externo o alcanza con el del hosting.

## Criterio de cierre

- API accesible por `https://<dominio>` con certificado válido.
- Deploy reproducible (push a rama o pipeline documentado).
- Migraciones corriendo en el deploy, swagger inaccesible, `/health` verde.
- `API_BASE_URL` de prod anotada para la fase de build de la app (pendiente 003-app).
