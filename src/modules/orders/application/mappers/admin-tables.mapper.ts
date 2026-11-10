import { Injectable } from '@nestjs/common';
import { StoreTable } from '../../../store/domain/entities/store-table.entity';
import {
  AdminTableItemDto,
  AdminTablesResponseDto,
} from '../dtos/admin-tables.response.dto';

@Injectable()
export class AdminTablesMapper {
  // Mesas del local + ocupación: activeOrderNumber = pedido dine_in
  // vivo en la mesa (null = libre). El use-case resuelve el mapa.
  toTablesResponse(
    tables: StoreTable[],
    activeByTable: Map<string, number>,
  ): AdminTablesResponseDto {
    const dto = new AdminTablesResponseDto();
    dto.items = tables.map((t) => {
      const item = new AdminTableItemDto();
      item.id = t.id;
      item.label = t.label;
      item.isActive = t.isActive;
      item.activeOrderNumber = activeByTable.get(t.id) ?? null;
      return item;
    });
    return dto;
  }
}
