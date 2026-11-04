export class ModifierOption {
  id!: string;
  groupId!: string;
  name!: string;
  extraPrice = 0;
  isRemovable = true;
  isAvailable = true;
  /**
   * Regla de negocio (decisión del usuario): si la opción incluida se
   * agota, ¿el cliente puede cambiarla por un adicional gratis?
   * false en el corazón del producto (salchicha, pan) — el dueño
   * marca el producto agotado en vez de regalar un sustituto.
   */
  isReplaceable = true;
  /**
   * ¿La opción puede ofrecerse como reemplazo gratis? false en lo que
   * no se regala (salchicha — doble cobrado); los toppings/salsas
   * baratas sí (default true).
   */
  isReplacementEligible = true;
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
