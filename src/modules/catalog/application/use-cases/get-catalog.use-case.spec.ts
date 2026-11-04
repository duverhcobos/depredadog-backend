import { Test } from '@nestjs/testing';
import { Category } from '../../domain/entities/category.entity';
import {
  ICatalogRepository,
  CATALOG_REPOSITORY,
} from '../../domain/repositories/catalog.repository.interface';
import { GetCatalogUseCase } from './get-catalog.use-case';

describe('GetCatalogUseCase', () => {
  let useCase: GetCatalogUseCase;
  let catalog: jest.Mocked<ICatalogRepository>;

  beforeEach(async () => {
    catalog = {
      getMenu: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        GetCatalogUseCase,
        { provide: CATALOG_REPOSITORY, useValue: catalog },
      ],
    }).compile();
    useCase = module.get(GetCatalogUseCase);
  });

  it('devuelve lo que el repositorio devuelve (delegación pura)', async () => {
    const categories = [new Category(), new Category()];
    catalog.getMenu.mockResolvedValue(categories);
    const result = await useCase.execute();
    expect(result).toBe(categories);
    expect(catalog.getMenu).toHaveBeenCalledTimes(1);
  });

  it('menú vacío → [] sin lanzar excepción', async () => {
    catalog.getMenu.mockResolvedValue([]);
    await expect(useCase.execute()).resolves.toEqual([]);
  });
});
