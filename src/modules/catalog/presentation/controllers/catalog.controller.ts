import { Controller, Get } from '@nestjs/common';
import { CatalogService } from '../../application/services/catalog.service';
import { CatalogResponseDto } from '../../application/dtos/catalog-response.dto';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // JWT global (sin @Public). Sin @Throttle propio: el default global
  // (100 req/min) sobra para un endpoint de lectura por navegación.
  @Get()
  getCatalog(): Promise<CatalogResponseDto> {
    return this.catalogService.getCatalog();
  }
}
