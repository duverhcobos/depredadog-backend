export class OrderItemModifierResponseDto {
  id!: string;
  optionId!: string | null;
  optionName!: string;
  action!: string;
  priceDelta!: number;
}
export class OrderItemResponseDto {
  id!: string;
  productId!: string;
  productName!: string;
  unitPrice!: number;
  quantity!: number;
  lineTotal!: number;
  notes!: string | null;
  modifiers!: OrderItemModifierResponseDto[];
}
export class OrderPaymentResponseDto {
  id!: string;
  method!: string;
  status!: string;
  amount!: number;
  payerPhone!: string | null;
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
