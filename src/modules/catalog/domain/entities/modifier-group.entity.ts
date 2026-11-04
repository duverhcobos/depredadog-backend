import { ModifierOption } from './modifier-option.entity';

export class ModifierGroup {
  id!: string;
  /** Clave estable para el consumidor: 'ingredients' | 'toppings' | 'sauces'… */
  slug!: string;
  name!: string;
  minSelect = 0;
  maxSelect: number | null = null;
  /** Orden de despliegue del grupo en el menú (global). */
  sortOrder = 0;
  /** Cargada por el repositorio solo cuando el use-case la pide. */
  options: ModifierOption[] = [];
  createdAt!: Date;
  updatedAt!: Date;
}
