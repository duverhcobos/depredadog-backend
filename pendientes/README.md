# Pendientes pre-producción — Backend

Ítems accionables del lado **backend** que hoy funcionan como workaround de dev/MVP pero deben resolverse — o aceptarse explícitamente — antes del deploy. Ver skill `pendientes-produccion` para formato y estados.

> Convención (decisión del usuario): **cada repo tiene su propia `pendientes/`** — esta carpeta es la del repo backend. Los ítems de la app viven en `../pcalientes_app/pendientes/`.

| # | Ítem | Estado | Bloqueo |
|---|------|--------|---------|
| 001 | [Migrar la base de datos a Supabase](001-migrar-a-supabase.md) | 🔴 PENDIENTE | bloqueante |
| 002 | [Envío real de emails](002-envio-email-real.md) | 🔴 PENDIENTE | bloqueante |
| 003 | [Hosting, dominio y deploy a producción](003-hosting-deploy.md) | 🔴 PENDIENTE | bloqueante |
| 004 | [Seguridad HTTP: helmet, throttle prod, CORS](004-seguridad-headers-throttle.md) | 🔴 PENDIENTE | recomendado fuerte |
| 005 | [Catálogo real de toppings y salsas (datos de negocio)](005-catalogo-toppings-salsas-real.md) | � RESUELTO | bloqueante |
| 006 | [Imágenes reales de productos (upload/hosting)](006-imagenes-productos-reales.md) | 🔴 PENDIENTE | bloqueante |
| 007 | [Gestión de catálogo por el dueño (admin CRUD + disponibilidad)](007-gestion-catalogo-admin.md) | 🔴 PENDIENTE | bloqueante |
| 008 | [Índices en junctions del catálogo](008-indices-junction-catalogo.md) | ✅ RESUELTO (propuesta 013) | recomendado |
| 009 | [Orders: re-validar reglas del catálogo en el servidor](009-orders-revalidar-catalogo.md) | 🔴 PENDIENTE | bloqueante para orders |
| 010 | [Onboarding Nequi Conecta (llaves QA + certificación + prod)](010-nequi-conecta-onboarding.md) | ⏸️ PENDIENTE EXTERNO | bloqueante para pagos reales |
