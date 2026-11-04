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
  slug!: string;
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
