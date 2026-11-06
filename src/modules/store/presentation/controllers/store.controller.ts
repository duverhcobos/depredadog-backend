import { Controller, Get } from '@nestjs/common';
import { StoreService } from '../../application/services/store.service';
import { StoreConfigResponseDto } from '../../application/dtos/store-config-response.dto';

@Controller('store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  // JWT global (igual que /catalog — la app lo consume logueada). Sin
  // @Throttle propio: lectura de navegación, el default global sobra.
  @Get('config')
  getConfig(): Promise<StoreConfigResponseDto> {
    return this.storeService.getConfig();
  }
}
