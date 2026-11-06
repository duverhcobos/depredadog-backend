import { registerAs } from '@nestjs/config';

// Zona horaria del negocio — define "abierto ahora" y el order_date
// de cada pedido. Colombia: America/Bogota.
export default registerAs('store', () => ({
  timezone: process.env.STORE_TIMEZONE || 'America/Bogota',
}));
