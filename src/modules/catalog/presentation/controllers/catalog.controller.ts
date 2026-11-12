import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../../common/decorators/public.decorator';
import { CatalogService } from '../../application/services/catalog.service';
import { CatalogResponseDto } from '../../application/dtos/catalog-response.dto';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) { }

  // PÚBLICO (§020): la carta es la vitrina — un invitado navega el
  // menú sin cuenta (auth solo para acciones que la requieren).
  // Throttle global 100 req/min aplica igual.
  @Public()
  @Get()
  getCatalog(): Promise<CatalogResponseDto> {
    return this.catalogService.getCatalog();
  }
}
