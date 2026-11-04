# Pendiente: Imágenes reales de productos (upload/hosting)

> **Estado: 🔴 PENDIENTE** — `imageUrl: null` en producción, assets locales en la app
> **Producto:** backend (consumo en `pcalientes_app`)
> **Bloqueo:** bloqueante — la imagen ES la carta en esta UI (floats 16:9
> sobre la firma); sin fotos reales no hay menú vendible

## Contexto

El modelo tiene `product_images` (múltiples por producto + `is_primary`),
y `GET /catalog` ya responde `imageUrl` (primaria). Pero hoy el seed lo
deja en `null` y la app mapea `product.slug` → asset empaquetado
(`catalog_mock` → assets locales).

Eso es estado de dev: para lanzar hacen falta **fotos reales del negocio**
(formato 16:9 según design-system) y un mecanismo para subirlas/hospedarlas.

## Qué falta

- Fotos reales de los productos del menú (16:9, responsabilidad del dueño).
- Decidir hosting: ¿Supabase Storage / CDN externo / el mismo backend
  sirviendo `/uploads`?
- Mecanismo de carga: endpoint admin de upload (ligado al pendiente 007)
  o carga manual al bucket + `UPDATE` de `image_url`.

## Criterio de cierre

- `product_images` poblada con URLs reales servibles públicamente.
- La app consume `imageUrl` remoto en vez del mapa de assets locales
  (manteniendo fallback al asset por slug si la URL falla o es null).
