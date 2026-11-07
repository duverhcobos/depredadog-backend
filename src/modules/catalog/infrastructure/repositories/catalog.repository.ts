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
  ) { }

  // 7 queries planas con IN — nada de N+1. El armado del árbol es memoria.
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

    const [images] = await Promise.all([
      this.images.find({ where: { productId: In(productIds) } }),
      this.attachModifierTree(products),
    ]);

    const imagesByProduct = new Map<string, ProductImage[]>();
    for (const i of images) {
      const list = imagesByProduct.get(i.productId) ?? [];
      list.push(i);
      imagesByProduct.set(i.productId, list);
    }
    for (const p of products) {
      p.images = imagesByProduct.get(p.id) ?? [];
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

  // Mismo árbol que getMenu pero acotado a ids y sin imágenes — el
  // pedido no las usa. Sin filtro de isAvailable: el use-case distingue
  // "agotado" de "no existe". Categoría inactiva = no ordenable, igual
  // que no aparece en la carta (un productId cacheado no basta).
  async getOrderableProducts(productIds: string[]): Promise<Product[]> {
    if (productIds.length === 0) return [];
    const activeCategories = await this.categories.find({
      where: { isActive: true },
      select: { id: true },
    });
    if (activeCategories.length === 0) return [];
    const products = await this.products.find({
      where: {
        id: In(productIds),
        categoryId: In(activeCategories.map((c) => c.id)),
        deletedAt: IsNull(),
      },
    });
    if (products.length === 0) return [];
    await this.attachModifierTree(products);
    return products;
  }

  // Árbol de modificadores por producto (grupos enlazados con opciones,
  // cada una con includedByDefault resuelto por producto) — comparten
  // getMenu y getOrderableProducts.
  private async attachModifierTree(products: Product[]): Promise<void> {
    const productIds = products.map((p) => p.id);
    const [links, defaults] = await Promise.all([
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
            order: { sortOrder: 'ASC' },
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
    // Una fila en product_modifier_options pisa el sort_order global de
    // la opción para ESE producto.
    const sortByProductOption = new Map(
      defaults.map((d) => [`${d.productId}:${d.optionId}`, d.sortOrder]),
    );
    const optionsByGroup = new Map<string, ModifierOption[]>();
    for (const o of options) {
      const list = optionsByGroup.get(o.groupId) ?? [];
      list.push(o);
      optionsByGroup.set(o.groupId, list);
    }
    const groupById = new Map(groups.map((g) => [g.id, g]));
    const linksByProduct = new Map<string, string[]>();
    for (const l of links) {
      const list = linksByProduct.get(l.productId) ?? [];
      list.push(l.groupId);
      linksByProduct.set(l.productId, list);
    }

    for (const p of products) {
      p.modifierGroups = (linksByProduct.get(p.id) ?? [])
        .map((gid) => groupById.get(gid))
        .filter((g): g is ModifierGroup => g !== undefined)
        .map((g) => {
          const clone = Object.assign(new ModifierGroup(), g);
          clone.options = (optionsByGroup.get(g.id) ?? [])
            .map((o) => {
              const opt = Object.assign(new ModifierOption(), o);
              opt.includedByDefault = defaultKeys.has(`${p.id}:${o.id}`);
              return opt;
            })
            .sort(
              (a, b) =>
                (sortByProductOption.get(`${p.id}:${a.id}`) ?? a.sortOrder) -
                (sortByProductOption.get(`${p.id}:${b.id}`) ?? b.sortOrder),
            );
          return clone;
        })
        .sort((a, b) => a.sortOrder - b.sortOrder);
    }
  }
}
