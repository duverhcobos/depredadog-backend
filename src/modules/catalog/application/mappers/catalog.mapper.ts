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
    dto.modifierGroups = p.modifierGroups.map((g) => this.toGroupResponse(g));
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
