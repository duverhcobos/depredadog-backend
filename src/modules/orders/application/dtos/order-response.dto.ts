export class OrderItemModifierResponseDto {
  id!: string;
  optionId!: string | null;
  optionName!: string;
  action!: string;
  priceDelta!: number;
  /** Porciones del adicional (§026) — `priceDelta` ya es el total de
   * línea (extra × times); la app pinta "Mozzarella ×3" con esto. */
  times!: number;
  modifierGroup!: string | null;
  replacesOptionId!: string | null;
}
export class OrderItemResponseDto {
  id!: string;
  productId!: string;
  productName!: string;
  productSlug!: string | null;
  unitPrice!: number;
  quantity!: number;
  lineTotal!: number;
  notes!: string | null;
  includedNames!: string[];
  modifiers!: OrderItemModifierResponseDto[];
}
export class OrderPaymentResponseDto {
  id!: string;
  method!: string;
  status!: string;
  amount!: number;
  payerPhone!: string | null;
  provider!: string | null;
  providerReference!: string | null;
}
export class OrderResponseDto {
  id!: string;
  orderNumber!: number;
  orderDate!: string;
  status!: string;
  serviceType!: string;
  contactPhone!: string | null;
  deliveryAddress!: string | null;
  deliveryLocationLink!: string | null;
  subtotal!: number;
  deliveryFee!: number;
  discount!: number;
  total!: number;
  notes!: string | null;
  cancelReason!: string | null;
  /** Cuándo entró al estado actual — la app ordena cada carril del
   * kanban por este campo (o placedAt si nació en el estado). */
  statusChangedAt!: Date;
  createdAt!: Date;
  items!: OrderItemResponseDto[];
  payment!: OrderPaymentResponseDto | null;
}
export class OrderListResponseDto {
  items!: OrderResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
