import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';
import { SkipThrottle } from '../../common/decorators/skip-throttle.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @Public()
  @SkipThrottle()
  async check() {
    const db = await this.dataSource
      .query('SELECT 1')
      .then(() => 'up')
      .catch(() => 'down');

    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
