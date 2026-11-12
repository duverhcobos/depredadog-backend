# Pendiente: `store_settings.support_phone` (WhatsApp del local)

> **Estado: 🔴 PENDIENTE** — la fila Soporte del perfil muestra un
> número placeholder (`kSupportPhone` en la app, §030)
> **Producto:** backend + app
> **Bloqueo:** no bloqueante — el diálogo funciona con placeholder;
> sí es requerido antes de producción (soporte debe apuntar al
> número real)

## Contexto

El tab Perfil de la app tiene la fila "Soporte" que abre un diálogo
con el WhatsApp del local para copiar/contactar. El backend no
tiene dónde guardar ese número: `store_settings` trae nombre,
dirección, fees y horarios pero ningún contacto.

## Qué falta

- Migración: `store_settings.support_phone` (text, NULL).
- `GET /store/config` lo expone (la app lo lee del mismo fetch que
  ya hace para isOpen/fee).
- App: `CheckoutStore`/`StoreConfig` entity gana `supportPhone`;
  el diálogo de soporte lo usa en vez del placeholder.
- Decidir si además se quiere `support_whatsapp` deep-link
  (`url_launcher` + `wa.me/57...`) — hoy el diálogo solo muestra y
  copia.

## Criterio de cierre

El número que ve el cliente en Soporte viene del backend (única
fuente editable por el dueño sin recompilar la app) o se acepta
explícitamente como constante configurada en deploy.
