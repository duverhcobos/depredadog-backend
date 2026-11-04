import { Inject, Injectable } from '@nestjs/common';
import { Category } from '../../domain/entities/category.entity';
import {
  type ICatalogRepository,
  CATALOG_REPOSITORY,
} from '../../domain/repositories/catalog.repository.interface';

@Injectable()
export class GetCatalogUseCase {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalog: ICatalogRepository,
  ) {}

  // Menú completo para la app. Vacío NO es error: la carta puede estar
  // sin cargar todavía y la app muestra su empty-state.
  execute(): Promise<Category[]> {
    return this.catalog.getMenu();
  }
}
