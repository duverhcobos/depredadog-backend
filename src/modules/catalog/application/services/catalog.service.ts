import { Injectable } from '@nestjs/common';
import { CatalogResponseDto } from '../dtos/catalog-response.dto';
import { CatalogMapper } from '../mappers/catalog.mapper';
import { GetCatalogUseCase } from '../use-cases/get-catalog.use-case';

@Injectable()
export class CatalogService {
  constructor(
    private readonly getCatalogUseCase: GetCatalogUseCase,
    private readonly catalogMapper: CatalogMapper,
  ) {}

  async getCatalog(): Promise<CatalogResponseDto> {
    const categories = await this.getCatalogUseCase.execute();
    return this.catalogMapper.toCatalogResponse(categories);
  }
}
