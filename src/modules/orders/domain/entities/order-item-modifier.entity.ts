import { ModifierAction } from '../enums/modifier-action.enum';

export class OrderItemModifier {
  id!: string;
  orderItemId!: string;
  /** NULL si la opción se borra del catálogo — el snapshot queda. */
  optionId: string | null = null;
  optionName!: string;
  action!: ModifierAction;
  priceDelta = 0;
}
