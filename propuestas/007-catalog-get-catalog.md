# Propuesta: Módulo `catalog` + `GET /catalog` (menú completo)

Primer módulo de negocio después de `auth`: la carta de Depredadog —
categorías, productos, imágenes y el árbol de personalización
(ingredientes / toppings / salsas vía grupos de modificadores
compartidos). Un solo endpoint de lectura que alimenta de una vez el
home, la lista de categoría y el detalle de producto de la app.

**Ubicación del endpoint** (checklist paso 0): módulo nuevo `catalog` —
bounded context propio (menú), no pertenece a `auth` ni a un kernel.
Ruta honesta: `GET /catalog`.

**Decisiones ya aprobadas por el usuario**:

- `product_modifier_options` — tabla puente nueva: el flag
  `included_by_default` es **por producto**, no global (mozzarella es
  default en El Cachorro y extra en El Coyote). `modelo-de-datos.md` se
  actualiza en esta misma propuesta (modelo-evolucion).
- Un solo `GET /catalog` protegido con JWT que devuelve el menú
  completo. WebSockets de disponibilidad diferidos al módulo `orders`.

**Decisión embebida extra** (a confirmar en la encuesta): `modifier_groups`
gana columna `slug` (`ingredients` / `toppings` / `sauces`) — la app
necesita distinguir grupos por clave estable, no por el nombre en
español que el dueño puede renombrar.

**Sin paginación** (excepción deliberada a `listados-paginacion-indices`):
el menú es un documento acotado (decenas de productos), no un listado
que crece sin límite — el contrato es una foto completa del menú para
cachear en la app. Sí aplican del skill: anti-N+1 (queries `IN`, no por
fila) e índices compuestos en la misma migración. RLS/tenant no aplica:
producto single-tenant.

**Disponibilidad**: el response trae `isAvailable` por producto Y por
opción — la app marca "agotado". La integridad final la valida `orders`
al crear el pedido (documentado como capa de dominio futura).

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/catalog/presentation/controllers/catalog.controller.ts` | nuevo — `GET /catalog` |
| `src/modules/catalog/application/services/catalog.service.ts` | nuevo — orquesta use-case + mapper |
| `src/modules/catalog/application/dtos/catalog-response.dto.ts` | nuevo — DTOs del menú |
| `src/modules/catalog/application/use-cases/get-catalog.use-case.ts` | nuevo |
| `src/modules/catalog/application/mappers/catalog.mapper.ts` | nuevo — domain → DTO |
| `src/modules/catalog/domain/entities/*.entity.ts` | 8 nuevas (una por tabla) |
| `src/modules/catalog/domain/repositories/catalog.repository.interface.ts` | nuevo — `ICatalogRepository` + token |
| `src/modules/catalog/infrastructure/repositories/catalog.repository.ts` | nuevo — getMenu sin N+1 |
| `src/infrastructure/database/migrations/<ts>-CreateCatalogTables.ts` | nueva — 8 tablas + índices |
| `src/infrastructure/database/schemas/*.schema.ts` | 8 nuevos |
| `src/infrastructure/database/seeds/catalog.seed.ts` + `package.json` | nuevo — seed de la carta (dev) |
| `src/modules/catalog/catalog.module.ts` + `src/app.module.ts` | wiring |
| `documentacion/modelo-de-datos.md` | actualización — junction + slug de grupo |
| `documentacion/api/catalog/001-get-catalog.md` + `documentacion/api/README.md` | doc del contrato |
| `test/catalog/get-catalog.e2e-spec.ts` | nuevo — e2e del endpoint |
| `*.spec.ts` | specs: use-case, repository, mapper |

---

## 1. `catalog.controller.ts` (archivo nuevo — stub)

**Ruta:** `src/modules/catalog/presentation/controllers/catalog.controller.ts`

```typescript
import { Controller } from '@nestjs/common';
import { CatalogService } from '../../application/services/catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}
}
```

## 2. `catalog.service.ts` (archivo nuevo — stub)

**Ruta:** `src/modules/catalog/application/services/catalog.service.ts`

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class CatalogService {}
```

## 3. `catalog-response.dto.ts` (archivo nuevo — completo)

**Ruta:** `src/modules/catalog/application/dtos/catalog-response.dto.ts`

```typescript
export class ModifierOptionResponseDto {
  id!: string;
  name!: string;
  extraPrice!: number;
  isAvailable!: boolean;
  includedByDefault!: boolean;
  isRemovable!: boolean;
  sortOrder!: number;
}

export class ModifierGroupResponseDto {
  id!: string;
  slug!: string;
  name!: string;
  minSelect!: number;
  maxSelect!: number | null;
  options!: ModifierOptionResponseDto[];
}

export class CatalogProductResponseDto {
  id!: string;
  name!: string;
  description!: string | null;
  basePrice!: number;
  imageUrl!: string | null;
  isAvailable!: boolean;
  isFeatured!: boolean;
  isCombo!: boolean;
  sortOrder!: number;
  modifierGroups!: ModifierGroupResponseDto[];
}

export class CatalogCategoryResponseDto {
  id!: string;
  slug!: string;
  name!: string;
  sortOrder!: number;
  products!: CatalogProductResponseDto[];
}

export class CatalogResponseDto {
  categories!: CatalogCategoryResponseDto[];
}
```

## 4. `catalog.controller.ts` (completar método)

**Ruta:** `src/modules/catalog/presentation/controllers/catalog.controller.ts`

**Antes:**
```typescript
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}
}
```

**Después:**
```typescript
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
```

## 5. `catalog.service.ts` (completar)

**Ruta:** `src/modules/catalog/application/services/catalog.service.ts`

**Antes:**
```typescript
@Injectable()
export class CatalogService {}
```

**Después:**
```typescript
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
```

## 6. `get-catalog.use-case.ts` (archivo nuevo — completo)

**Ruta:** `src/modules/catalog/application/use-cases/get-catalog.use-case.ts`

```typescript
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
```

## 7. Entidades de dominio (archivos nuevos — completos)

### `src/modules/catalog/domain/entities/category.entity.ts`

```typescript
import { Product } from './product.entity';

export class Category {
  id!: string;
  name!: string;
  slug!: string;
  description: string | null = null;
  imageUrl: string | null = null;
  isActive = true;
  sortOrder = 0;
  /** Cargada por el repositorio solo cuando el use-case la pide. */
  products: Product[] = [];
  createdAt!: Date;
  updatedAt!: Date;
}
```

### `src/modules/catalog/domain/entities/product.entity.ts`

```typescript
import { ModifierGroup } from './modifier-group.entity';
import { ProductImage } from './product-image.entity';

export class Product {
  id!: string;
  categoryId!: string;
  name!: string;
  description: string | null = null;
  basePrice!: number;
  isAvailable = true;
  isCombo = false;
  isFeatured = false;
  sortOrder = 0;
  /** Cargadas por el repositorio solo cuando el use-case las pide. */
  images: ProductImage[] = [];
  modifierGroups: ModifierGroup[] = [];
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt: Date | null = null;
}
```

### `src/modules/catalog/domain/entities/product-image.entity.ts`

```typescript
export class ProductImage {
  id!: string;
  productId!: string;
  imageUrl!: string;
  sortOrder = 0;
  isPrimary = false;
  createdAt!: Date;
}
```

### `src/modules/catalog/domain/entities/combo-item.entity.ts`

```typescript
export class ComboItem {
  id!: string;
  comboId!: string;
  itemProductId!: string;
  quantity = 1;
}
```

### `src/modules/catalog/domain/entities/modifier-group.entity.ts`

```typescript
import { ModifierOption } from './modifier-option.entity';

export class ModifierGroup {
  id!: string;
  /** Clave estable para el consumidor: 'ingredients' | 'toppings' | 'sauces'… */
  slug!: string;
  name!: string;
  minSelect = 0;
  maxSelect: number | null = null;
  /** Cargada por el repositorio solo cuando el use-case la pide. */
  options: ModifierOption[] = [];
  createdAt!: Date;
  updatedAt!: Date;
}
```

### `src/modules/catalog/domain/entities/modifier-option.entity.ts`

```typescript
export class ModifierOption {
  id!: string;
  groupId!: string;
  name!: string;
  extraPrice = 0;
  isRemovable = true;
  isAvailable = true;
  sortOrder = 0;
  /**
   * Resuelto POR PRODUCTO desde product_modifier_options (no es columna
   * de modifier_options): true = viene en el producto salvo que el
   * cliente lo quite.
   */
  includedByDefault = false;
  createdAt!: Date;
  updatedAt!: Date;
}
```

### `src/modules/catalog/domain/entities/product-modifier-group.entity.ts`

```typescript
export class ProductModifierGroup {
  productId!: string;
  groupId!: string;
}
```

### `src/modules/catalog/domain/entities/product-modifier-option.entity.ts`

```typescript
export class ProductModifierOption {
  productId!: string;
  optionId!: string;
  includedByDefault = false;
  sortOrder = 0;
}
```

## 8. `catalog.repository.interface.ts` (archivo nuevo — completo)

**Ruta:** `src/modules/catalog/domain/repositories/catalog.repository.interface.ts`

```typescript
import { Category } from '../entities/category.entity';

export interface ICatalogRepository {
  /**
   * Menú completo para la app: categorías activas con sus productos
   * (vivos — incluye isAvailable=false para que la app muestre
   * "agotado"), imagen primaria por producto y el árbol de
   * modificadores por producto (grupos enlazados con opciones, cada
   * opción con su includedByDefault resuelto por producto).
   */
  getMenu(): Promise<Category[]>;
}

export const CATALOG_REPOSITORY = Symbol('ICatalogRepository');
```

## 9. Migración — `CreateCatalogTables` (archivo nuevo — completo)

**Ruta:** `src/infrastructure/database/migrations/<timestamp>-CreateCatalogTables.ts`
*(el timestamp lo asigna `npm run migration:create`)*

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCatalogTables implements MigrationInterface {
  name = 'CreateCatalogTables';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(100) NOT NULL,
        "slug" varchar(100) NOT NULL,
        "description" text,
        "image_url" varchar(500),
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_categories_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "category_id" uuid NOT NULL REFERENCES "categories"("id"),
        "name" varchar(150) NOT NULL,
        "description" text,
        "base_price" numeric(10,2) NOT NULL,
        "is_available" boolean NOT NULL DEFAULT true,
        "is_combo" boolean NOT NULL DEFAULT false,
        "is_featured" boolean NOT NULL DEFAULT false,
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_products_category_sort" ON "products" ("category_id", "sort_order")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_featured" ON "products" ("is_featured") WHERE "is_featured"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_available" ON "products" ("is_available")`,
    );

    await queryRunner.query(`
      CREATE TABLE "product_images" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "image_url" varchar(500) NOT NULL,
        "sort_order" int NOT NULL DEFAULT 0,
        "is_primary" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_product_images_product_sort" ON "product_images" ("product_id", "sort_order")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_product_images_primary" ON "product_images" ("product_id") WHERE "is_primary"`,
    );

    await queryRunner.query(`
      CREATE TABLE "combo_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "combo_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "item_product_id" uuid NOT NULL REFERENCES "products"("id"),
        "quantity" int NOT NULL DEFAULT 1,
        CONSTRAINT "uq_combo_items_pair" UNIQUE ("combo_id", "item_product_id")
      )
    `);

    // slug: clave estable para el consumidor ('ingredients', 'toppings',
    // 'sauces') — el name es display editable (evolución del modelo).
    await queryRunner.query(`
      CREATE TABLE "modifier_groups" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(50) NOT NULL,
        "name" varchar(100) NOT NULL,
        "min_select" int NOT NULL DEFAULT 0,
        "max_select" int,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_modifier_groups_slug" UNIQUE ("slug")
      )
    `);

    // included_by_default NO va aquí (evolución del modelo): "viene por
    // defecto" es por-producto → vive en product_modifier_options.
    await queryRunner.query(`
      CREATE TABLE "modifier_options" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL REFERENCES "modifier_groups"("id") ON DELETE CASCADE,
        "name" varchar(100) NOT NULL,
        "extra_price" numeric(10,2) NOT NULL DEFAULT 0,
        "is_removable" boolean NOT NULL DEFAULT true,
        "is_available" boolean NOT NULL DEFAULT true,
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_modifier_options_group_sort" ON "modifier_options" ("group_id", "sort_order")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_modifier_options_available" ON "modifier_options" ("is_available")`,
    );

    await queryRunner.query(`
      CREATE TABLE "product_modifier_groups" (
        "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "group_id" uuid NOT NULL REFERENCES "modifier_groups"("id") ON DELETE CASCADE,
        PRIMARY KEY ("product_id", "group_id")
      )
    `);

    // Qué opciones vienen por defecto en cada producto (sparse: solo las
    // incluidas; el resto del grupo enlazado se ofrece como adicional).
    await queryRunner.query(`
      CREATE TABLE "product_modifier_options" (
        "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "option_id" uuid NOT NULL REFERENCES "modifier_options"("id") ON DELETE CASCADE,
        "included_by_default" boolean NOT NULL DEFAULT true,
        "sort_order" int NOT NULL DEFAULT 0,
        PRIMARY KEY ("product_id", "option_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "product_modifier_options"`);
    await queryRunner.query(`DROP TABLE "product_modifier_groups"`);
    await queryRunner.query(`DROP TABLE "modifier_options"`);
    await queryRunner.query(`DROP TABLE "modifier_groups"`);
    await queryRunner.query(`DROP TABLE "combo_items"`);
    await queryRunner.query(`DROP TABLE "product_images"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
```

## 10. Schemas TypeORM (archivos nuevos — completos)

### `src/infrastructure/database/schemas/category.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { Category } from '../../../modules/catalog/domain/entities/category.entity';

export const CategorySchema = new EntitySchema<Category>({
  name: 'Category',
  target: Category,
  tableName: 'categories',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    name: { type: 'varchar', length: 100 },
    slug: { type: 'varchar', length: 100 },
    description: { type: 'text', nullable: true },
    imageUrl: { name: 'image_url', type: 'varchar', length: 500, nullable: true },
    isActive: { name: 'is_active', type: 'boolean', default: true },
    sortOrder: { name: 'sort_order', type: 'int', default: 0 },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
```

### `src/infrastructure/database/schemas/product.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { Product } from '../../../modules/catalog/domain/entities/product.entity';

// numeric(10,2) llega de pg como string — transformer a number en la frontera.
const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const ProductSchema = new EntitySchema<Product>({
  name: 'Product',
  target: Product,
  tableName: 'products',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    categoryId: { name: 'category_id', type: 'uuid' },
    name: { type: 'varchar', length: 150 },
    description: { type: 'text', nullable: true },
    basePrice: { name: 'base_price', type: 'numeric', precision: 10, scale: 2, transformer: numeric },
    isAvailable: { name: 'is_available', type: 'boolean', default: true },
    isCombo: { name: 'is_combo', type: 'boolean', default: false },
    isFeatured: { name: 'is_featured', type: 'boolean', default: false },
    sortOrder: { name: 'sort_order', type: 'int', default: 0 },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
    deletedAt: { name: 'deleted_at', type: 'timestamptz', nullable: true, deleteDate: true },
  },
});
```

### `src/infrastructure/database/schemas/product-image.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { ProductImage } from '../../../modules/catalog/domain/entities/product-image.entity';

export const ProductImageSchema = new EntitySchema<ProductImage>({
  name: 'ProductImage',
  target: ProductImage,
  tableName: 'product_images',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    productId: { name: 'product_id', type: 'uuid' },
    imageUrl: { name: 'image_url', type: 'varchar', length: 500 },
    sortOrder: { name: 'sort_order', type: 'int', default: 0 },
    isPrimary: { name: 'is_primary', type: 'boolean', default: false },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
  },
});
```

### `src/infrastructure/database/schemas/combo-item.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { ComboItem } from '../../../modules/catalog/domain/entities/combo-item.entity';

export const ComboItemSchema = new EntitySchema<ComboItem>({
  name: 'ComboItem',
  target: ComboItem,
  tableName: 'combo_items',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    comboId: { name: 'combo_id', type: 'uuid' },
    itemProductId: { name: 'item_product_id', type: 'uuid' },
    quantity: { type: 'int', default: 1 },
  },
});
```

### `src/infrastructure/database/schemas/modifier-group.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { ModifierGroup } from '../../../modules/catalog/domain/entities/modifier-group.entity';

export const ModifierGroupSchema = new EntitySchema<ModifierGroup>({
  name: 'ModifierGroup',
  target: ModifierGroup,
  tableName: 'modifier_groups',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    slug: { type: 'varchar', length: 50 },
    name: { type: 'varchar', length: 100 },
    minSelect: { name: 'min_select', type: 'int', default: 0 },
    maxSelect: { name: 'max_select', type: 'int', nullable: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
```

### `src/infrastructure/database/schemas/modifier-option.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { ModifierOption } from '../../../modules/catalog/domain/entities/modifier-option.entity';

const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const ModifierOptionSchema = new EntitySchema<ModifierOption>({
  name: 'ModifierOption',
  target: ModifierOption,
  tableName: 'modifier_options',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    groupId: { name: 'group_id', type: 'uuid' },
    name: { type: 'varchar', length: 100 },
    extraPrice: { name: 'extra_price', type: 'numeric', precision: 10, scale: 2, transformer: numeric },
    isRemovable: { name: 'is_removable', type: 'boolean', default: true },
    isAvailable: { name: 'is_available', type: 'boolean', default: true },
    sortOrder: { name: 'sort_order', type: 'int', default: 0 },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
// includedByDefault no es columna — la resuelve el repositorio por producto.
```

### `src/infrastructure/database/schemas/product-modifier-group.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { ProductModifierGroup } from '../../../modules/catalog/domain/entities/product-modifier-group.entity';

export const ProductModifierGroupSchema = new EntitySchema<ProductModifierGroup>({
  name: 'ProductModifierGroup',
  target: ProductModifierGroup,
  tableName: 'product_modifier_groups',
  columns: {
    productId: { name: 'product_id', type: 'uuid', primary: true },
    groupId: { name: 'group_id', type: 'uuid', primary: true },
  },
});
```

### `src/infrastructure/database/schemas/product-modifier-option.schema.ts`

```typescript
import { EntitySchema } from 'typeorm';
import { ProductModifierOption } from '../../../modules/catalog/domain/entities/product-modifier-option.entity';

export const ProductModifierOptionSchema = new EntitySchema<ProductModifierOption>({
  name: 'ProductModifierOption',
  target: ProductModifierOption,
  tableName: 'product_modifier_options',
  columns: {
    productId: { name: 'product_id', type: 'uuid', primary: true },
    optionId: { name: 'option_id', type: 'uuid', primary: true },
    includedByDefault: { name: 'included_by_default', type: 'boolean', default: true },
    sortOrder: { name: 'sort_order', type: 'int', default: 0 },
  },
});
```

## 11. `catalog.repository.ts` (archivo nuevo — completo)

**Ruta:** `src/modules/catalog/infrastructure/repositories/catalog.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Category } from '../../domain/entities/category.entity';
import { ModifierGroup } from '../../domain/entities/modifier-group.entity';
import { ModifierOption } from '../../domain/entities/modifier-option.entity';
import { Product } from '../../domain/entities/product.entity';
import { ProductImage } from '../../domain/entities/product-image.entity';
import { ProductModifierGroup } from '../../domain/entities/product-modifier-group.entity';
import { ProductModifierOption } from '../../domain/entities/product-modifier-option.entity';
import { ICatalogRepository } from '../../domain/repositories/catalog.repository.interface';

@Injectable()
export class CatalogRepository implements ICatalogRepository {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly images: Repository<ProductImage>,
    @InjectRepository(ProductModifierGroup)
    private readonly productGroups: Repository<ProductModifierGroup>,
    @InjectRepository(ModifierGroup)
    private readonly groups: Repository<ModifierGroup>,
    @InjectRepository(ModifierOption)
    private readonly options: Repository<ModifierOption>,
    @InjectRepository(ProductModifierOption)
    private readonly productOptions: Repository<ProductModifierOption>,
  ) {}

  // 5 queries planas con IN — nada de N+1. El armado del árbol es memoria.
  async getMenu(): Promise<Category[]> {
    const categories = await this.categories.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
    if (categories.length === 0) return [];

    const categoryIds = categories.map((c) => c.id);
    const products = await this.products.find({
      where: { categoryId: In(categoryIds), deletedAt: IsNull() },
      order: { sortOrder: 'ASC' },
    });
    const productIds = products.map((p) => p.id);
    if (productIds.length === 0) {
      for (const c of categories) c.products = [];
      return categories;
    }

    const [images, links, defaults] = await Promise.all([
      this.images.find({ where: { productId: In(productIds) } }),
      this.productGroups.find({ where: { productId: In(productIds) } }),
      this.productOptions.find({ where: { productId: In(productIds) } }),
    ]);

    const groupIds = [...new Set(links.map((l) => l.groupId))];
    const [groups, options] =
      groupIds.length === 0
        ? [[], []]
        : await Promise.all([
            this.groups.find({
              where: { id: In(groupIds) },
              order: { slug: 'ASC' },
            }),
            this.options.find({
              where: { groupId: In(groupIds) },
              order: { sortOrder: 'ASC' },
            }),
          ]);

    // includedByDefault por producto (product_modifier_options es sparse:
    // solo filas incluidas por defecto — el resto del grupo es adicional).
    const defaultKeys = new Set(
      defaults
        .filter((d) => d.includedByDefault)
        .map((d) => `${d.productId}:${d.optionId}`),
    );
    const optionsByGroup = new Map<string, ModifierOption[]>();
    for (const o of options) {
      const list = optionsByGroup.get(o.groupId) ?? [];
      list.push(o);
      optionsByGroup.set(o.groupId, list);
    }
    const groupById = new Map(groups.map((g) => [g.id, g]));
    const imagesByProduct = new Map<string, ProductImage[]>();
    for (const i of images) {
      const list = imagesByProduct.get(i.productId) ?? [];
      list.push(i);
      imagesByProduct.set(i.productId, list);
    }
    const linksByProduct = new Map<string, string[]>();
    for (const l of links) {
      const list = linksByProduct.get(l.productId) ?? [];
      list.push(l.groupId);
      linksByProduct.set(l.productId, list);
    }

    for (const p of products) {
      p.images = imagesByProduct.get(p.id) ?? [];
      p.modifierGroups = (linksByProduct.get(p.id) ?? [])
        .map((gid) => groupById.get(gid))
        .filter((g): g is ModifierGroup => g !== undefined)
        .map((g) => {
          const clone = Object.assign(new ModifierGroup(), g);
          clone.options = (optionsByGroup.get(g.id) ?? []).map((o) => {
            const opt = Object.assign(new ModifierOption(), o);
            opt.includedByDefault = defaultKeys.has(`${p.id}:${o.id}`);
            return opt;
          });
          return clone;
        });
    }

    const productsByCategory = new Map<string, Product[]>();
    for (const p of products) {
      const list = productsByCategory.get(p.categoryId) ?? [];
      list.push(p);
      productsByCategory.set(p.categoryId, list);
    }
    for (const c of categories) {
      c.products = productsByCategory.get(c.id) ?? [];
    }
    return categories;
  }
}
```

## 12. `catalog.mapper.ts` (archivo nuevo — completo)

**Ruta:** `src/modules/catalog/application/mappers/catalog.mapper.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Category } from '../../domain/entities/category.entity';
import { ModifierGroup } from '../../domain/entities/modifier-group.entity';
import { ModifierOption } from '../../domain/entities/modifier-option.entity';
import { Product } from '../../domain/entities/product.entity';
import {
  CatalogCategoryResponseDto,
  CatalogProductResponseDto,
  CatalogResponseDto,
  ModifierGroupResponseDto,
  ModifierOptionResponseDto,
} from '../dtos/catalog-response.dto';

@Injectable()
export class CatalogMapper {
  toCatalogResponse(categories: Category[]): CatalogResponseDto {
    const dto = new CatalogResponseDto();
    dto.categories = categories.map((c) => this.toCategoryResponse(c));
    return dto;
  }

  private toCategoryResponse(c: Category): CatalogCategoryResponseDto {
    const dto = new CatalogCategoryResponseDto();
    dto.id = c.id;
    dto.slug = c.slug;
    dto.name = c.name;
    dto.sortOrder = c.sortOrder;
    dto.products = c.products.map((p) => this.toProductResponse(p));
    return dto;
  }

  private toProductResponse(p: Product): CatalogProductResponseDto {
    const dto = new CatalogProductResponseDto();
    dto.id = p.id;
    dto.name = p.name;
    dto.description = p.description;
    dto.basePrice = p.basePrice;
    dto.imageUrl = p.images.find((i) => i.isPrimary)?.imageUrl ?? null;
    dto.isAvailable = p.isAvailable;
    dto.isFeatured = p.isFeatured;
    dto.isCombo = p.isCombo;
    dto.sortOrder = p.sortOrder;
    dto.modifierGroups = p.modifierGroups.map((g) =>
      this.toGroupResponse(g),
    );
    return dto;
  }

  private toGroupResponse(g: ModifierGroup): ModifierGroupResponseDto {
    const dto = new ModifierGroupResponseDto();
    dto.id = g.id;
    dto.slug = g.slug;
    dto.name = g.name;
    dto.minSelect = g.minSelect;
    dto.maxSelect = g.maxSelect;
    dto.options = g.options.map((o) => this.toOptionResponse(o));
    return dto;
  }

  private toOptionResponse(o: ModifierOption): ModifierOptionResponseDto {
    const dto = new ModifierOptionResponseDto();
    dto.id = o.id;
    dto.name = o.name;
    dto.extraPrice = o.extraPrice;
    dto.isAvailable = o.isAvailable;
    dto.includedByDefault = o.includedByDefault;
    dto.isRemovable = o.isRemovable;
    dto.sortOrder = o.sortOrder;
    return dto;
  }
}
```

## 13. `catalog.module.ts` + `app.module.ts`

### `src/modules/catalog/catalog.module.ts` (archivo nuevo — completo)

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategorySchema } from '../../infrastructure/database/schemas/category.schema';
import { ComboItemSchema } from '../../infrastructure/database/schemas/combo-item.schema';
import { ModifierGroupSchema } from '../../infrastructure/database/schemas/modifier-group.schema';
import { ModifierOptionSchema } from '../../infrastructure/database/schemas/modifier-option.schema';
import { ProductImageSchema } from '../../infrastructure/database/schemas/product-image.schema';
import { ProductModifierGroupSchema } from '../../infrastructure/database/schemas/product-modifier-group.schema';
import { ProductModifierOptionSchema } from '../../infrastructure/database/schemas/product-modifier-option.schema';
import { ProductSchema } from '../../infrastructure/database/schemas/product.schema';
import { CatalogController } from './presentation/controllers/catalog.controller';
import { CatalogService } from './application/services/catalog.service';
import { CatalogMapper } from './application/mappers/catalog.mapper';
import { GetCatalogUseCase } from './application/use-cases/get-catalog.use-case';
import { CATALOG_REPOSITORY } from './domain/repositories/catalog.repository.interface';
import { CatalogRepository } from './infrastructure/repositories/catalog.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CategorySchema,
      ProductSchema,
      ProductImageSchema,
      ComboItemSchema,
      ModifierGroupSchema,
      ModifierOptionSchema,
      ProductModifierGroupSchema,
      ProductModifierOptionSchema,
    ]),
  ],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    CatalogMapper,
    GetCatalogUseCase,
    { provide: CATALOG_REPOSITORY, useClass: CatalogRepository },
  ],
})
export class CatalogModule {}
```

### `src/app.module.ts` (archivo existente — fragmento)

**Antes:**
```typescript
import { AuthModule } from './modules/auth/auth.module';
```
```typescript
    HealthModule,
    AuthModule,
  ],
```

**Después:**
```typescript
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
```
```typescript
    HealthModule,
    AuthModule,
    CatalogModule,
  ],
```

## 14. `documentacion/modelo-de-datos.md` (actualización — modelo-evolucion)

**Antes** (tabla `modifier_options`):
```markdown
| `extra_price` | numeric(10,2) | NOT NULL, default 0 | 0 = incluido; >0 = extra pago |
| `included_by_default` | boolean | NOT NULL, default false | Viene en el producto salvo que el cliente lo quite |
| `is_removable` | boolean | NOT NULL, default true | false = obligatorio (el pan) |
```

**Después:**
```markdown
| `extra_price` | numeric(10,2) | NOT NULL, default 0 | 0 = incluido; >0 = extra pago |
| `is_removable` | boolean | NOT NULL, default true | false = obligatorio (el pan) |
```

**Antes** (tabla `modifier_groups`):
```markdown
| `id` | uuid PK | | |
| `name` | varchar(100) | NOT NULL | |
```

**Después:**
```markdown
| `id` | uuid PK | | |
| `slug` | varchar(50) UNIQUE | NOT NULL | Clave estable para el consumidor: `ingredients`, `toppings`, `sauces` — el nombre es display editable |
| `name` | varchar(100) | NOT NULL | |
```

**Antes** (después de `product_modifier_groups`, en "Decisiones tomadas"):
```markdown
### Decisiones tomadas (`catalog`)

- **Un solo mecanismo de personalización**: `included_by_default` + `is_removable` + `extra_price` cubren "quítale la cebolla" (incluida, removible, $0), "el pan obligatorio" (no removible), "queso extra +$2" (no incluido, precio>0) y "máx 3 salsas" (`max_select` del grupo).
```

**Después:**
```markdown
### `product_modifier_options`

Qué opciones vienen **por defecto en cada producto** — evolución del
modelo: `included_by_default` NO es global en `modifier_options` porque
la misma opción puede ser default en un producto y extra en otro
(mozzarella: default en El Cachorro, adicional en El Coyote). La tabla
es *sparse*: solo existen filas de opciones incluidas por defecto; el
resto de opciones del grupo enlazado se ofrece como adicional.

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `product_id` | uuid FK → `products` ON DELETE CASCADE | NOT NULL | |
| `option_id` | uuid FK → `modifier_options` ON DELETE CASCADE | NOT NULL | |
| `included_by_default` | boolean | NOT NULL, default true | Reservado: false = la fila marca opción disponible-pero-nunca-default (futura exclusión por producto) |
| `sort_order` | int | NOT NULL, default 0 | Orden de la opción en este producto |

Constraint: `PRIMARY KEY (product_id, option_id)`.

### Decisiones tomadas (`catalog`)

- **Un solo mecanismo de personalización**: `product_modifier_options.included_by_default` (por producto) + `is_removable` + `extra_price` cubren "quítale la cebolla" (incluida por defecto, removible, $0), "el pan obligatorio" (default + no removible), "queso extra +$2" (no incluido, precio>0) y "máx 3 salsas" (`max_select` del grupo).
```

## 15. Doc del contrato — `documentacion/api/catalog/001-get-catalog.md` + README

### `documentacion/api/catalog/001-get-catalog.md` (archivo nuevo — completo)

```markdown
# GET /catalog

> Menú completo: categorías activas con productos, imagen primaria y el
> árbol de modificadores por producto (ingredientes / toppings / salsas
> con defaults y precios). Una sola llamada alimenta home, lista y
> detalle de la app — pensada para cachearse y refrescarse al entrar al
> detalle o al checkout.

| | |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/catalog` |
| **Autenticación** | Bearer token requerido |
| **Rol requerido** | cualquier usuario autenticado |
| **Rate limit** | default global (100 req/min) |
| **Implementado** | propuesta 007 |
| **Integrado en app** | ⬜ pendiente |

## Request

Sin body ni query params.

## Responses

### 200 — Menú

```json
{
  "categories": [
    {
      "id": "uuid",
      "slug": "perros",
      "name": "Perros",
      "sortOrder": 0,
      "products": [
        {
          "id": "uuid",
          "name": "El Cachorro",
          "description": "El primer mordisco de la manada.",
          "basePrice": 14000,
          "imageUrl": null,
          "isAvailable": true,
          "isFeatured": false,
          "isCombo": false,
          "sortOrder": 0,
          "modifierGroups": [
            {
              "id": "uuid",
              "slug": "ingredients",
              "name": "Ingredientes",
              "minSelect": 0,
              "maxSelect": null,
              "options": [
                {
                  "id": "uuid",
                  "name": "Queso mozzarella",
                  "extraPrice": 3500,
                  "isAvailable": true,
                  "includedByDefault": true,
                  "isRemovable": true,
                  "sortOrder": 6
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

| Campo | Descripción |
|-------|-------------|
| `categories[].products[]` | Incluye `isAvailable=false` (la app los muestra "agotados") y excluye soft-deleted. Categorías sin productos llegan con `products: []`. |
| `imageUrl` | Imagen primaria del producto; `null` mientras no haya fotos hospedadas (la app usa sus assets locales por convención de slug). |
| `modifierGroups[].slug` | Clave estable del grupo: `ingredients` (adicionar/quitar), `toppings`, `sauces` — no depender del `name` editable. |
| `options[].includedByDefault` | `true` = viene en el producto salvo que el cliente lo quite (por producto). |
| `options[].isRemovable` | `false` = obligatorio (pan, salchicha) — no se desmarca aunque venga por defecto. |
| `options[].extraPrice` | COP como número entero; `0` = gratis (toppings/salsas). |

### 401 — Sin token / token inválido

Formato estándar `{ "statusCode": 401, "message": "Unauthorized" }`.

## Notas

- La **integridad de disponibilidad** la re-valida `orders` al crear el
  pedido (un ingrediente puede agotarse entre cargar el menú y ordenar);
  este endpoint solo da el estado fresco al momento de la llamada.
- `isAvailable` existe a nivel producto Y opción — apagar una opción la
  apaga en TODO el menú (catálogo compartido).
```

### `documentacion/api/README.md` (fila en el índice)

Agregar a la tabla índice:

```markdown
| GET | `/catalog` | [catálogo completo](catalog/001-get-catalog.md) | 🔶 backend listo — sin integrar |
```

## 16. Seed de la carta — `catalog.seed.ts` + script npm

Datos de negocio NO van en la migración de esquema (workflow) — el seed
es un comando aparte, idempotente por slugs, con la carta que hoy vive
en el mock de la app (6 perros + papas + grupos Ingredientes/Toppings/
Salsas + defaults por producto). Las listas reales de toppings/salsas
siguen pendientes (pendientes/005) — el seed usa las del mock marcadas
como provisionales.

### `src/infrastructure/database/seeds/catalog.seed.ts` (archivo nuevo)

```typescript
import dataSource from '../../typeorm.config';

// Seed de desarrollo de la carta — idempotente por slugs/nombres.
// Uso: npm run seed:catalog
```

El contenido son `INSERT … ON CONFLICT DO NOTHING` por tablas:
`categories` (perros, mas, bebidas, combos) → `modifier_groups`
(ingredients/toppings/sauces) → `modifier_options` (catálogo del mock)
→ `products` (los 7 ítems con precios del mock) →
`product_modifier_groups` (perros/papas ↔ 3 grupos) →
`product_modifier_options` (defaults por perro + pan/salchicha
`is_removable=false`). Pan NO se ofrece como opción del grupo en la app;
la salchicha sí como adicional "doble" — ambas `included_by_default` +
`is_removable=false` por producto.

### `package.json` (fragmento)

**Antes:**
```json
    "migration:show": "typeorm-ts-node-commonjs migration:show -d typeorm.config.ts"
```

**Después:**
```json
    "migration:show": "typeorm-ts-node-commonjs migration:show -d typeorm.config.ts",
    "seed:catalog": "ts-node src/infrastructure/database/seeds/catalog.seed.ts"
```

## 17. Tests

### `src/modules/catalog/application/use-cases/get-catalog.use-case.spec.ts`

- Devuelve lo que el repo devuelve (delegación pura).
- Menú vacío → `[]` (no lanza excepción).
Mock: `ICatalogRepository` con `getMenu` mock tipado.

### `src/modules/catalog/infrastructure/repositories/catalog.repository.spec.ts`

Mock de los 7 `Repository<T>` (`getRepositoryToken`):
- Categorías vacías → `[]` sin consultar productos.
- Sin productos → categorías con `products: []` sin consultar modificadores.
- Ensamblaje: opciones por grupo, `includedByDefault` resuelto por
  producto (misma opción default en un producto y adicional en otro).
- Producto sin grupos enlazados → `modifierGroups: []`.

### `src/modules/catalog/application/mappers/catalog.mapper.spec.ts`

- `imageUrl` = la imagen `isPrimary` (o null sin imágenes).
- Mapeo completo de flags (`includedByDefault`, `isRemovable`,
  `maxSelect` null).

### `test/catalog/get-catalog.e2e-spec.ts`

- 401 sin token.
- 200 con token: fixture insertado vía `DataSource` (1 categoría, 1
  producto, 1 grupo+2 opciones, 1 opción default por producto) →
  verifica estructura completa del JSON (nested modifierGroups).
- Categoría sin productos → `products: []`.
- Producto `isAvailable=false` → llega en el response con su flag.
Limpieza: `TRUNCATE product_modifier_options, product_modifier_groups,
modifier_options, modifier_groups, combo_items, product_images,
products, categories RESTART IDENTITY CASCADE` en beforeEach + el
`cleanAuthTables` existente para el usuario.

## Orden de aplicación recomendado

1 → 2 → 3 → 4 → 5 → 6 → 7 (entidades) → 8 → 9 (migración: `migration:create`, pegar, `migration:run` dev+test, `revert`+`run` en test) → 10 (schemas) → 11 → 12 → 13 → 16 (seed) → 17 (specs) → correr `npx tsc --noEmit`, `npm run test`, `npm run test:e2e` → 14 (modelo doc) → 15 (doc api con JSON real del e2e).

## Verificación

- `npm run migration:run` en dev y test · `migration:revert` limpio en test.
- `npx tsc --noEmit` · `npm run test` · `npm run test:e2e` en verde.
- `npm run seed:catalog` + `GET /catalog` con token devuelve la carta del mock.
