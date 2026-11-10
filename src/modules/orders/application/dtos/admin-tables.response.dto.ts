export class AdminTableItemDto {
  id!: string;
  label!: string;
  isActive!: boolean;
  /** Número del pedido dine_in vivo en la mesa — null = libre. */
  activeOrderNumber!: number | null;
}

export class AdminTablesResponseDto {
  items!: AdminTableItemDto[];
}
