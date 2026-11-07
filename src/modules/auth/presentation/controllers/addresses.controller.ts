import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../../../common/decorators/current-user.decorator';
import { AddressesService } from '../../application/services/addresses.service';
import { CreateAddressDto } from '../../application/dtos/create-address.dto';
import { UpdateAddressDto } from '../../application/dtos/update-address.dto';

// CRUD de las direcciones guardadas del cliente (§014). TODO recurso
// cuelga del JWT — nunca del :id ni del body (idor-checklist).
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.addressesService.list(user.userId);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addressesService.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.addressesService.remove(user.userId, id);
  }
}
