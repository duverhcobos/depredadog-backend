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
