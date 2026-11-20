import { ModifierAction } from '../enums/modifier-action.enum';

export class OrderItemModifier {
  id!: string;
  orderItemId!: string;
  /** NULL si la opción se borra del catálogo — el snapshot queda. */
  optionId: string | null = null;
  optionName!: string;
  action!: ModifierAction;
  priceDelta = 0;
  /** Porciones del adicional (§026): solo aplica a filas `added` —
   *  `priceDelta` ya es el total de línea (extra × times). Removed y
   *  reemplazos gratis siempre son 1. */
  times = 1;
  /** Snapshot del slug del grupo origen (§016) — la app secciona el
   *  detalle con él; null en filas previas a §016. */
  modifierGroup: string | null = null;
  /** Solo en la fila added del cambio gratis (§016): el incluido
   *  agotado que esta opción reemplaza — empareja el par removed→added. */
  replacesOptionId: string | null = null;
}
