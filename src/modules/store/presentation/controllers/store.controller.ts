import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../../common/decorators/public.decorator';
import { StoreService } from '../../application/services/store.service';
import { StoreConfigResponseDto } from '../../application/dtos/store-config-response.dto';

@Controller('store')
export class StoreController {
  constructor(private readonly storeService: StoreService) { }

  // PÚBLICO (§020): horarios/abierto/dirección/teléfono son info de
  // negocio pública — el invitado ve "El local" sin cuenta.
  @Public()
  @Get('config')
  getConfig(): Promise<StoreConfigResponseDto> {
    return this.storeService.getConfig();
  }
}
