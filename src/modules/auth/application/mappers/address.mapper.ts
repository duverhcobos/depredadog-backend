import { Injectable } from '@nestjs/common';
import { Address } from '../../domain/entities/address.entity';
import { AddressResponseDto } from '../dtos/address-response.dto';

@Injectable()
export class AddressMapper {
  toResponse(a: Address): AddressResponseDto {
    const dto = new AddressResponseDto();
    dto.id = a.id;
    dto.label = a.label;
    dto.landmark = a.landmark;
    dto.neighborhood = a.neighborhood;
    dto.type = a.type;
    dto.latitude = a.latitude;
    dto.longitude = a.longitude;
    dto.isDefault = a.isDefault;
    dto.createdAt = a.createdAt;
    dto.updatedAt = a.updatedAt;
    return dto;
  }

  toResponseList(rows: Address[]): AddressResponseDto[] {
    return rows.map((a) => this.toResponse(a));
  }
}
