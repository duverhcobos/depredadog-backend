import { registerAs } from '@nestjs/config';

export default registerAs('throttle', () => ({
  // THROTTLE_TTL llega en segundos; @nestjs/throttler trabaja en ms
  ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10) * 1000,
  limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
}));
