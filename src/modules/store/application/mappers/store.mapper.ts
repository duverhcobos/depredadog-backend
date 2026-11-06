import { Injectable } from '@nestjs/common';
import { BusinessHour } from '../../domain/entities/business-hour.entity';
import { StoreSettings } from '../../domain/entities/store-settings.entity';
import {
  DayHoursResponseDto,
  StoreConfigResponseDto,
} from '../dtos/store-config-response.dto';

@Injectable()
export class StoreMapper {
  toConfigResponse(
    settings: StoreSettings,
    hours: BusinessHour[],
    isOpen: boolean,
    today: BusinessHour | null,
  ): StoreConfigResponseDto {
    const dto = new StoreConfigResponseDto();
    dto.name = settings.name;
    dto.phone = settings.phone;
    dto.address = settings.address;
    dto.logoUrl = settings.logoUrl;
    dto.deliveryFee = settings.deliveryFee;
    dto.minDeliveryOrder = settings.minDeliveryOrder;
    dto.isOpen = isOpen;
    dto.today = today ? this.toDayHours(today) : null;
    dto.weeklyHours = hours.map((h) => this.toDayHours(h));
    return dto;
  }

  private toDayHours(h: BusinessHour): DayHoursResponseDto {
    const dto = new DayHoursResponseDto();
    dto.dayOfWeek = h.dayOfWeek;
    // PG time llega 'HH:MM:SS' — el contrato expone 'HH:MM'.
    dto.opensAt = h.opensAt.slice(0, 5);
    dto.closesAt = h.closesAt.slice(0, 5);
    dto.isClosed = h.isClosed;
    return dto;
  }
}
