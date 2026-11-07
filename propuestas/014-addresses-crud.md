# Propuesta: CRUD de direcciones del cliente (`GET/POST/PATCH/DELETE /addresses`)

Las ubicaciones guardadas del checkout (`Casa`, `Trabajo`, "casa de mi
mamá") son hoy mocks en la app (§022). Esta propuesta implementa el
CRUD real sobre la tabla `addresses` — que **ya existe** desde la
migración de auth — pero cuyo esquema quedó desactualizado frente a
las decisiones §022a/b: la zona no tiene nomenclatura de calles y la
"dirección" es un **punto de referencia** + barrio/sector opcional +
tipo (casa/trabajo/otro → ícono).

**Decisiones ya tomadas con el usuario (encuesta previa):**

1. **Evolución honesta del esquema** — rename `address_line`→`landmark`
   y `reference`→`neighborhood`, + columna `type` enum
   (`home|work|other`). DB↔API↔app hablan el mismo idioma; sin capa de
   traducción permanente.
2. **Borrado: `ON DELETE SET NULL` + borrado real.** `orders.address_id`
   referencia `addresses` sin cascade — hoy borrar una dirección con
   pedidos explotaría en FK error. La orden ya guarda
   `delivery_address` como snapshot inmutable (filosofía del modelo —
   misma regla de `order_item_modifiers.option_id` nullable): el link
   es solo procedencia, se suelta y la fila desaparece de verdad.
   Sin soft delete.
3. **Default automática: la primera dirección guardada queda
   `is_default=true`**; marcar otra como default limpia las demás en
   la misma transacción (el índice parcial único ya existe). Si se
   borra la default, la más antigua restante la hereda — así el
   checkout siempre tiene preselección.

**Decisiones embebidas — encuestadas y aprobadas (todas):**

- `type` es **columna enum `address_type`** (`home|work|other`), NOT
  NULL default `other` — conjunto cerrado de UI, misma convención de
  enums del esquema. En el POST es **requerido** — la app siempre lo
  declara (el picker tiene selección por defecto).
- `label` es **requerido siempre** — el cliente manda el texto final
  ("Casa"/"Trabajo"/"casa de mi mamá"); el backend no deriva
  etiquetas localizadas.
- Máximo **10 direcciones por usuario** (anti-abuso, aprobado) →
  `409`.
- Ownership: `user_id` SIEMPRE del JWT (`@CurrentUser`); PATCH/DELETE
  de dirección ajena o inexistente → **404** (anti-enumeración, no
  403 — `idor-checklist`).
- Sin paginación: la lista está acotada por la regla de negocio (10) —
  excepción documentada a `listados-paginacion-indices`.
- `PATCH` acepta `null` explícito en `neighborhood`/`latitude`/
  `longitude` para **limpiar** el campo (campo ausente = no tocar).
- PATCH `isDefault: false` sobre la default se permite (aprobado —
  el cliente puede quedar sin default; el checkout cae a la primera).

**Módulo:** `auth` — `addresses` pertenece a su conjunto de tablas
(`users`/`addresses`/`devices`/tokens, modelo-de-datos línea 742);
`AddressSchema` ya está registrado en `AuthModule`. Es dato del perfil
del usuario — el bounded context correcto. La ruta es top-level
honesta: `/addresses` (no `/auth/addresses`).

**Endpoints:**

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/addresses` | Mis direcciones (default primero, luego `created_at` ASC) |
| `POST` | `/addresses` | Crear una mía (201) — primera = default automática |
| `PATCH` | `/addresses/:id` | Editar parcial la mía (404 si no es mía) |
| `DELETE` | `/addresses/:id` | Borrar la mía (204; si era default, la más antigua hereda) |

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/presentation/controllers/addresses.controller.ts` | **nuevo** — 4 endpoints, todos JWT (`@CurrentUser`) |
| `src/modules/auth/application/services/addresses.service.ts` | **nuevo** — orquesta los 4 use-cases + mapper |
| `src/modules/auth/application/dtos/create-address.dto.ts` | **nuevo** |
| `src/modules/auth/application/dtos/update-address.dto.ts` | **nuevo** |
| `src/modules/auth/application/dtos/address-response.dto.ts` | **nuevo** |
| `src/modules/auth/application/use-cases/list-addresses.use-case.ts` | **nuevo** |
| `src/modules/auth/application/use-cases/create-address.use-case.ts` | **nuevo** — límite 10 + primera default |
| `src/modules/auth/application/use-cases/update-address.use-case.ts` | **nuevo** — ownership + exclusividad de default |
| `src/modules/auth/application/use-cases/delete-address.use-case.ts` | **nuevo** — ownership + herencia de default |
| `src/modules/auth/domain/enums/address-type.enum.ts` | **nuevo** |
| `src/modules/auth/domain/entities/address.entity.ts` | update — `landmark`/`neighborhood`/`type` |
| `src/modules/auth/domain/exceptions/address-not-found.exception.ts` | **nuevo** — 404 |
| `src/modules/auth/domain/exceptions/address-limit-reached.exception.ts` | **nuevo** — 409 |
| `src/modules/auth/domain/repositories/address.repository.interface.ts` | **nuevo** — interface + token |
| `src/infrastructure/database/migrations/<ts>-EvolveAddressesToLandmark.ts` | **nuevo** — renames + enum + FK SET NULL |
| `src/infrastructure/database/schemas/address.schema.ts` | update — columnas nuevas + transformer numeric null-safe |
| `src/modules/auth/infrastructure/repositories/address.repository.ts` | **nuevo** — transacciones de default |
| `src/modules/auth/application/mappers/address.mapper.ts` | **nuevo** — domain → response |
| `src/modules/auth/auth.module.ts` | providers + controller |
| `test/auth/addresses.e2e-spec.ts` | **nuevo** — CRUD + IDOR + límite + default |
| `test/support/e2e-app.ts` | `cleanAuthTables` ya trunca `addresses` — sin cambio |
| `documentacion/api/auth/012-015-*.md` + `README.md` | docs de los 4 endpoints |
| `documentacion/modelo-de-datos.md` | tabla `addresses` actualizada (modelo-evolucion) |

---

## 1. addresses.controller.ts (archivo nuevo — stub)

**Ruta:** `src/modules/auth/presentation/controllers/addresses.controller.ts`

```typescript
import { Controller } from '@nestjs/common';
import { AddressesService } from '../../application/services/addresses.service';

@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}
}
```

## 2. addresses.service.ts (archivo nuevo — stub)

**Ruta:** `src/modules/auth/application/services/addresses.service.ts`

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class AddressesService {}
```

## 3. DTOs

**Ruta:** `src/modules/auth/application/dtos/create-address.dto.ts`

```typescript
import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AddressType } from '../../domain/enums/address-type.enum';

export class CreateAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  label!: string;

  // §022a — la zona no tiene nomenclatura de calles: el punto de
  // referencia ES la dirección ("Casa blanca frente a la cancha").
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  landmark!: string;

  // Barrio/vereda/sector — opcional (§022a).
  @IsString()
  @IsOptional()
  @MaxLength(150)
  neighborhood?: string;

  // Clase de la ubicación — decide el ícono en la app (§022b).
  @IsEnum(AddressType)
  type!: AddressType;

  // Pin de Google opcional (§022d — hoy se adjunta al pedido; la
  // ubicación guardada también puede conservarlo).
  @IsLatitude()
  @IsOptional()
  latitude?: number;

  @IsLongitude()
  @IsOptional()
  longitude?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
```

**Ruta:** `src/modules/auth/application/dtos/update-address.dto.ts`

```typescript
import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AddressType } from '../../domain/enums/address-type.enum';

// PATCH parcial: todo opcional. En los campos NULLABLES, `null`
// explícito LIMPIA el valor; campo ausente = no tocar.
export class UpdateAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @IsOptional()
  label?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsOptional()
  landmark?: string;

  // null explícito = quitar el sector.
  @IsString()
  @MaxLength(150)
  @IsOptional()
  neighborhood?: string | null;

  @IsEnum(AddressType)
  @IsOptional()
  type?: AddressType;

  @IsLatitude()
  @IsOptional()
  latitude?: number | null;

  @IsLongitude()
  @IsOptional()
  longitude?: number | null;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
```

**Ruta:** `src/modules/auth/application/dtos/address-response.dto.ts`

```typescript
import { AddressType } from '../../domain/enums/address-type.enum';

export class AddressResponseDto {
  id!: string;
  label!: string;
  landmark!: string;
  neighborhood!: string | null;
  type!: AddressType;
  latitude!: number | null;
  longitude!: number | null;
  isDefault!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
```

## 4. addresses.controller.ts (completar)

**Ruta:** `src/modules/auth/presentation/controllers/addresses.controller.ts`

```typescript
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
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAddressDto) {
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
```

## 5. addresses.service.ts (completar)

**Ruta:** `src/modules/auth/application/services/addresses.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { CreateAddressDto } from '../dtos/create-address.dto';
import { UpdateAddressDto } from '../dtos/update-address.dto';
import { AddressResponseDto } from '../dtos/address-response.dto';
import { AddressMapper } from '../mappers/address.mapper';
import { ListAddressesUseCase } from '../use-cases/list-addresses.use-case';
import { CreateAddressUseCase } from '../use-cases/create-address.use-case';
import { UpdateAddressUseCase } from '../use-cases/update-address.use-case';
import { DeleteAddressUseCase } from '../use-cases/delete-address.use-case';

@Injectable()
export class AddressesService {
  constructor(
    private readonly listAddresses: ListAddressesUseCase,
    private readonly createAddress: CreateAddressUseCase,
    private readonly updateAddress: UpdateAddressUseCase,
    private readonly deleteAddress: DeleteAddressUseCase,
    private readonly mapper: AddressMapper,
  ) {}

  async list(userId: string): Promise<AddressResponseDto[]> {
    const rows = await this.listAddresses.execute({ userId });
    return this.mapper.toResponseList(rows);
  }

  async create(
    userId: string,
    dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    const address = await this.createAddress.execute({ userId, ...dto });
    return this.mapper.toResponse(address);
  }

  async update(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    const address = await this.updateAddress.execute({
      userId,
      addressId,
      ...dto,
    });
    return this.mapper.toResponse(address);
  }

  async remove(userId: string, addressId: string): Promise<void> {
    await this.deleteAddress.execute({ userId, addressId });
  }
}
```

## 6. Use-cases

**Ruta:** `src/modules/auth/application/use-cases/list-addresses.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Address } from '../../domain/entities/address.entity';
import {
  type IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../domain/repositories/address.repository.interface';

export interface ListAddressesCommand {
  userId: string;
}

@Injectable()
export class ListAddressesUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY)
    private readonly addresses: IAddressRepository,
  ) {}

  execute(cmd: ListAddressesCommand): Promise<Address[]> {
    return this.addresses.findAllByUserId(cmd.userId);
  }
}
```

**Ruta:** `src/modules/auth/application/use-cases/create-address.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Address } from '../../domain/entities/address.entity';
import { AddressType } from '../../domain/enums/address-type.enum';
import { AddressLimitReachedException } from '../../domain/exceptions/address-limit-reached.exception';
import {
  type IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../domain/repositories/address.repository.interface';

// §014 — regla anti-abuso: máximo de direcciones guardadas por
// cliente (la lista GET nunca excede este tope → sin paginación).
const MAX_ADDRESSES_PER_USER = 10;

export interface CreateAddressCommand {
  userId: string;
  label: string;
  landmark: string;
  neighborhood?: string;
  type: AddressType;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
}

@Injectable()
export class CreateAddressUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY)
    private readonly addresses: IAddressRepository,
  ) {}

  async execute(cmd: CreateAddressCommand): Promise<Address> {
    const count = await this.addresses.countByUserId(cmd.userId);
    if (count >= MAX_ADDRESSES_PER_USER) {
      throw new AddressLimitReachedException();
    }
    const address = new Address();
    address.userId = cmd.userId;
    address.label = cmd.label.trim();
    address.landmark = cmd.landmark.trim();
    address.neighborhood = cmd.neighborhood?.trim() || null;
    address.type = cmd.type;
    address.latitude = cmd.latitude ?? null;
    address.longitude = cmd.longitude ?? null;
    // §014 — la primera dirección del cliente queda default
    // automática (el checkout preselecciona); una explícita gana.
    address.isDefault = cmd.isDefault ?? count === 0;
    return address.isDefault
      ? this.addresses.saveAsExclusiveDefault(address)
      : this.addresses.save(address);
  }
}
```

**Ruta:** `src/modules/auth/application/use-cases/update-address.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Address } from '../../domain/entities/address.entity';
import { AddressType } from '../../domain/enums/address-type.enum';
import { AddressNotFoundException } from '../../domain/exceptions/address-not-found.exception';
import {
  type IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../domain/repositories/address.repository.interface';

export interface UpdateAddressCommand {
  userId: string;
  addressId: string;
  label?: string;
  landmark?: string;
  neighborhood?: string | null;
  type?: AddressType;
  latitude?: number | null;
  longitude?: number | null;
  isDefault?: boolean;
}

@Injectable()
export class UpdateAddressUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY)
    private readonly addresses: IAddressRepository,
  ) {}

  async execute(cmd: UpdateAddressCommand): Promise<Address> {
    // IDOR: findByIdForUser filtra por dueño — una dirección ajena
    // responde 404 igual que una inexistente (anti-enumeración).
    const address = await this.addresses.findByIdForUser(
      cmd.addressId,
      cmd.userId,
    );
    if (!address) {
      throw new AddressNotFoundException();
    }
    if (cmd.label !== undefined) address.label = cmd.label.trim();
    if (cmd.landmark !== undefined) address.landmark = cmd.landmark.trim();
    if (cmd.neighborhood !== undefined) {
      address.neighborhood = cmd.neighborhood?.trim() || null;
    }
    if (cmd.type !== undefined) address.type = cmd.type;
    if (cmd.latitude !== undefined) address.latitude = cmd.latitude;
    if (cmd.longitude !== undefined) address.longitude = cmd.longitude;
    if (cmd.isDefault !== undefined) address.isDefault = cmd.isDefault;
    // Si quedó marcada default, la exclusividad limpia las demás en
    // la misma transacción (índice parcial único lo respalda).
    return address.isDefault
      ? this.addresses.saveAsExclusiveDefault(address)
      : this.addresses.save(address);
  }
}
```

**Ruta:** `src/modules/auth/application/use-cases/delete-address.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AddressNotFoundException } from '../../domain/exceptions/address-not-found.exception';
import {
  type IAddressRepository,
  ADDRESS_REPOSITORY,
} from '../../domain/repositories/address.repository.interface';

export interface DeleteAddressCommand {
  userId: string;
  addressId: string;
}

@Injectable()
export class DeleteAddressUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY)
    private readonly addresses: IAddressRepository,
  ) {}

  async execute(cmd: DeleteAddressCommand): Promise<void> {
    const address = await this.addresses.findByIdForUser(
      cmd.addressId,
      cmd.userId,
    );
    if (!address) {
      throw new AddressNotFoundException();
    }
    // La transacción interna promueve la más antigua si la borrada
    // era la default — el checkout siempre conserva preselección.
    await this.addresses.delete(address);
  }
}
```

## 7. Dominio

**Ruta:** `src/modules/auth/domain/enums/address-type.enum.ts` (nuevo)

```typescript
// Clase de la ubicación guardada — el ícono de la app (§022b).
export enum AddressType {
  HOME = 'home',
  WORK = 'work',
  OTHER = 'other',
}
```

**Ruta:** `src/modules/auth/domain/entities/address.entity.ts` (actualización)

```typescript
import { AddressType } from '../enums/address-type.enum';

export class Address {
  id!: string;
  userId!: string;
  label!: string;
  // §022a — la zona no tiene nomenclatura: el punto de referencia ES
  // la dirección ("Casa blanca frente a la cancha").
  landmark!: string;
  // Barrio/vereda/sector — opcional.
  neighborhood: string | null = null;
  type: AddressType = AddressType.OTHER;
  latitude: number | null = null;
  longitude: number | null = null;
  isDefault = false;
  createdAt!: Date;
  updatedAt!: Date;
}
```

**Ruta:** `src/modules/auth/domain/exceptions/address-not-found.exception.ts` (nuevo)

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

// 404 deliberado (no 403): una dirección ajena responde igual que una
// inexistente — no se revela que existe (idor-checklist).
export class AddressNotFoundException extends DomainException {
  constructor() {
    super('Address not found', 404);
  }
}
```

**Ruta:** `src/modules/auth/domain/exceptions/address-limit-reached.exception.ts` (nuevo)

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class AddressLimitReachedException extends DomainException {
  constructor() {
    super('Address limit reached (10 per user)', 409);
  }
}
```

**Ruta:** `src/modules/auth/domain/repositories/address.repository.interface.ts` (nuevo)

```typescript
import { Address } from '../entities/address.entity';

export interface IAddressRepository {
  /** Default primero, luego por antigüedad — orden del checkout. */
  findAllByUserId(userId: string): Promise<Address[]>;
  /** IDOR-safe: null si no existe O si no es del usuario. */
  findByIdForUser(id: string, userId: string): Promise<Address | null>;
  countByUserId(userId: string): Promise<number>;
  save(address: Address): Promise<Address>;
  /**
   * Guarda marcando `is_default` y, en la MISMA transacción, apaga el
   * flag del resto del usuario — respalda el índice parcial único
   * `uq_addresses_default`.
   */
  saveAsExclusiveDefault(address: Address): Promise<Address>;
  /**
   * Borra la fila; si era la default y quedan direcciones, promueve
   * la más antigua en la misma transacción — el checkout siempre
   * conserva preselección.
   */
  delete(address: Address): Promise<void>;
}

export const ADDRESS_REPOSITORY = Symbol('IAddressRepository');
```

## 8. Persistencia

**Ruta:** `src/infrastructure/database/migrations/<timestamp>-EvolveAddressesToLandmark.ts` (nuevo — `npm run migration:create`)

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class EvolveAddressesToLandmark implements MigrationInterface {
  name = 'EvolveAddressesToLandmark';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "address_type" AS ENUM ('home','work','other')`,
    );
    // §022a — la zona no tiene nomenclatura: la "dirección" ES el
    // punto de referencia; el sector va en neighborhood.
    await queryRunner.query(
      `ALTER TABLE "addresses" RENAME COLUMN "address_line" TO "landmark"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" RENAME COLUMN "reference" TO "neighborhood"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" ADD COLUMN "type" "address_type" NOT NULL DEFAULT 'other'`,
    );
    // §014 — borrar una dirección NO tira el pedido: la orden ya
    // guarda delivery_address como snapshot; el link solo era
    // procedencia (misma filosofía que order_item_modifiers.option_id).
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "orders_address_id_fkey"`,
    );
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "orders_address_id_fkey"
      FOREIGN KEY ("address_id") REFERENCES "addresses"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "orders_address_id_fkey"`,
    );
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "orders_address_id_fkey"
      FOREIGN KEY ("address_id") REFERENCES "addresses"("id")
    `);
    await queryRunner.query(`ALTER TABLE "addresses" DROP COLUMN "type"`);
    await queryRunner.query(
      `ALTER TABLE "addresses" RENAME COLUMN "neighborhood" TO "reference"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" RENAME COLUMN "landmark" TO "address_line"`,
    );
    await queryRunner.query(`DROP TYPE "address_type"`);
  }
}
```

> Verificar tras `migration:run` que el nombre real de la FK es
> `orders_address_id_fkey` (convención PG para REFERENCES inline). El
> `down()` revierte en orden inverso exacto.

**Ruta:** `src/infrastructure/database/schemas/address.schema.ts` (actualización — archivo completo por claridad)

```typescript
import { EntitySchema } from 'typeorm';
import { Address } from '../../../modules/auth/domain/entities/address.entity';
import { AddressType } from '../../../modules/auth/domain/enums/address-type.enum';

// PG devuelve numeric como string — mismo transformer local de
// order.schema.ts, con guarda NULL (lat/lng son nullable).
const numeric = {
  to: (value: number) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

export const AddressSchema = new EntitySchema<Address>({
  name: 'Address',
  target: Address,
  tableName: 'addresses',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    userId: { name: 'user_id', type: 'uuid' },
    label: { type: 'varchar', length: 50 },
    landmark: { type: 'varchar', length: 255 },
    neighborhood: { type: 'text', nullable: true },
    type: {
      type: 'enum',
      enum: AddressType,
      enumName: 'address_type',
      default: AddressType.OTHER,
    },
    latitude: {
      type: 'numeric',
      precision: 9,
      scale: 6,
      nullable: true,
      transformer: numeric,
    },
    longitude: {
      type: 'numeric',
      precision: 9,
      scale: 6,
      nullable: true,
      transformer: numeric,
    },
    isDefault: { name: 'is_default', type: 'boolean', default: false },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
```

## 9. Infraestructura

**Ruta:** `src/modules/auth/infrastructure/repositories/address.repository.ts` (nuevo)

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from '../../domain/entities/address.entity';
import { IAddressRepository } from '../../domain/repositories/address.repository.interface';

@Injectable()
export class AddressRepository implements IAddressRepository {
  constructor(
    @InjectRepository(Address) private readonly orm: Repository<Address>,
  ) {}

  findAllByUserId(userId: string): Promise<Address[]> {
    return this.orm.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  }

  findByIdForUser(id: string, userId: string): Promise<Address | null> {
    return this.orm.findOne({ where: { id, userId } });
  }

  countByUserId(userId: string): Promise<number> {
    return this.orm.count({ where: { userId } });
  }

  save(address: Address): Promise<Address> {
    return this.orm.save(address);
  }

  saveAsExclusiveDefault(address: Address): Promise<Address> {
    // Una sola default por usuario — el índice parcial único lo
    // garantiza a nivel BD; la transacción lo hace atómico.
    return this.orm.manager.transaction(async (em) => {
      await em.update(
        Address,
        { userId: address.userId },
        { isDefault: false },
      );
      return em.save(address);
    });
  }

  async delete(address: Address): Promise<void> {
    await this.orm.manager.transaction(async (em) => {
      const wasDefault = address.isDefault;
      const userId = address.userId;
      await em.remove(address);
      if (!wasDefault) return;
      // §014 — la más antigua hereda la default: la preselección del
      // checkout sobrevive al borrado.
      const oldest = await em.findOne(Address, {
        where: { userId },
        order: { createdAt: 'ASC' },
      });
      if (oldest) {
        oldest.isDefault = true;
        await em.save(oldest);
      }
    });
  }
}
```

## 10. Mapper de aplicación

**Ruta:** `src/modules/auth/application/mappers/address.mapper.ts` (nuevo)

```typescript
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
```

## 11. auth.module.ts (actualización)

**Ruta:** `src/modules/auth/auth.module.ts`

**Antes (imports + controllers + tail de providers):**

```typescript
import { AuthController } from './presentation/controllers/auth.controller';
// ...
  controllers: [AuthController],
  providers: [
    // ...
    JwtStrategy,
  ],
})
export class AuthModule {}
```

**Después:**

```typescript
import { AuthController } from './presentation/controllers/auth.controller';
import { AddressesController } from './presentation/controllers/addresses.controller';
import { AddressesService } from './application/services/addresses.service';
import { AddressMapper } from './application/mappers/address.mapper';
import { ListAddressesUseCase } from './application/use-cases/list-addresses.use-case';
import { CreateAddressUseCase } from './application/use-cases/create-address.use-case';
import { UpdateAddressUseCase } from './application/use-cases/update-address.use-case';
import { DeleteAddressUseCase } from './application/use-cases/delete-address.use-case';
import { ADDRESS_REPOSITORY } from './domain/repositories/address.repository.interface';
import { AddressRepository } from './infrastructure/repositories/address.repository';
// ...
  controllers: [AuthController, AddressesController],
  providers: [
    // ...existentes
    AddressesService,
    AddressMapper,
    ListAddressesUseCase,
    CreateAddressUseCase,
    UpdateAddressUseCase,
    DeleteAddressUseCase,
    { provide: ADDRESS_REPOSITORY, useClass: AddressRepository },
    JwtStrategy,
  ],
})
export class AuthModule {}
```

`AddressSchema` ya está en `TypeOrmModule.forFeature` — sin cambio ahí.

## 12. Tests

- **Unitarios** (`unit-test-checklist`):
  - `create-address.use-case.spec.ts` — límite 10 → 409; primera →
    default automática; isDefault explícita → `saveAsExclusiveDefault`;
    trims.
  - `update-address.use-case.spec.ts` — ajena/inexistente → 404;
    campos ausentes no se tocan; `null` limpia nullable; isDefault →
    repo exclusivo.
  - `delete-address.use-case.spec.ts` — ajena → 404; delega al repo.
  - `list-addresses.use-case.spec.ts` — pasa userId al repo.
  - `address.mapper.spec.ts` — mapeo completo.
  - `address.repository.spec.ts` — mock de `Repository`: orden del
    find (isDefault DESC + createdAt ASC), `findByIdForUser` filtra
    por userId, exclusividad dentro de transaction, promoción al
    borrar default.
- **e2e** `test/auth/addresses.e2e-spec.ts` — flujo real por HTTP
  (setup: `registerUser` + `activateAndGetTokens`, la truncate ya
  cubre `addresses`):
  1. `GET` vacío → `[]`.
  2. `POST` primera → 201 `isDefault: true` (auto).
  3. `POST` segunda sin flag → `isDefault: false`.
  4. `GET` → 2 filas, la default primero.
  5. `POST` tercera con `isDefault: true` → ella queda única default.
  6. `PATCH` landmark/type → 200 actualizado.
  7. `PATCH` `isDefault: true` en otra → exclusividad (GET lo prueba).
  8. `DELETE` no-default → 204; `DELETE` default → 204 y la más
     antigua restante queda default.
  9. **IDOR**: usuario B hace `PATCH`/`DELETE` del `id` de A → 404.
  10. `PATCH`/`DELETE` uuid inexistente → 404.
  11. `POST` la 11ª → 409.
  12. Validaciones: sin `landmark`/`type` → 400; `type: 'oficina'` →
      400; `latitude: 200` → 400; campo extra en body → 400
      (`forbidNonWhitelisted`).
  13. Sin token → 401 en los 4.

- **Doc API** (`api-docs`): `documentacion/api/auth/012-get-addresses.md`,
  `013-post-addresses.md`, `014-patch-addresses-id.md`,
  `015-delete-addresses-id.md` (JSONs copiados de lo que el e2e
  devuelve realmente) + filas en `documentacion/api/README.md`.
- **Modelo** (`modelo-evolucion`): `documentacion/modelo-de-datos.md`
  tabla `addresses` → `landmark`, `neighborhood`, `type` + nota de
  decisión (§014/§022a).

---

## Orden de aplicación recomendado

1. `addresses.controller.ts` (stub) → `addresses.service.ts` (stub)
2. DTOs (`create`, `update`, `response`) + `address-type.enum.ts`
3. `addresses.controller.ts` completo
4. `addresses.service.ts` completo
5. Use-cases ×4 → excepciones ×2 → `address.entity.ts` →
   `address.repository.interface.ts`
6. `migration:create` + migración escrita a mano → `address.schema.ts`
   → `npm run migration:run` (dev) + verificar nombre de la FK real +
   `migration:revert` en test → re-run (checklist `migrations-workflow`)
7. `address.repository.ts` → `address.mapper.ts`
8. `auth.module.ts`
9. `.spec.ts` unitarios + `addresses.e2e-spec.ts` → `npm run test` +
   `test:e2e`
10. `documentacion/api/` + README + `modelo-de-datos.md`
11. `npx tsc --noEmit` + suite completa verde

---

## §014a — Registro de implementación

Implementada y auditada. Verificación: `tsc --noEmit` limpio, 163
tests unitarios, 17 e2e de addresses (75 e2e totales del repo),
migración `EvolveAddressesToLandmark1794056030249` corrida en dev y
test con `revert`+`re-run` verificados; nombre real de la FK
`orders_address_id_fkey` confirmado en `pg_constraint`.

Desviaciones y correcciones aplicadas sobre el draft original:

1. **Nombre de clase de migración con timestamp** — TypeORM exige el
   sufijo de 13 dígitos para ordenar/revertir; quedó
   `EvolveAddressesToLandmark1794056030249`.
2. **`saveAsExclusiveDefault` blindado** (bug encontrado en
   implementación + verificado con e2e): `uq_addresses_default` NO es
   deferrable → hay que apagar las demás ANTES de grabar (revertir el
   orden propuesto inicialmente como fix provoca 500 por
   unique-violation). Además el `em.update` se acotó a
   `{userId, isDefault: true, id: Not(address.id)}` — las hermanas ya
   apagadas no reciben bump de `updated_at` — y la entidad detached
   refresca `updatedAt` explícito antes del save (sin eso quedaba
   stale = `created_at`). `delete()` aplica el mismo refresh a la
   fila promovida.
3. **`UpdateAddressDto` endurecido** (IMPORTANTE del revisor):
   `@IsOptional()` traga `null` y lo dejaba llegar al use-case →
   `null.trim()`/violación NOT NULL → 500. Los campos no-nullable
   (`label`, `landmark`, `type`, `isDefault`) ahora usan
   `@ValidateIf(≠ undefined)` — el `null` explícito corre los
   validadores y responde **400**. Los nullable conservan
   `@IsOptional()` con semántica "null = limpiar".
4. **`@Matches(/\S/)` en `label`/`landmark`** (MENOR del revisor) —
   `"   "` ya no persiste como `''` post-trim.
5. **e2e ampliado de 13 a 17 casos**: null-en-no-nullable → 400,
   espacios-vacíos → 400 (POST y PATCH), `:id` no-UUID → 400, y
   `isDefault:false` sobre la única default → 200 quedando sin
   default (decisión aprobada).

Aceptado como trade-off (INFO del revisor, no bloqueante): TOCTOU en
el tope de 10 y la primera default — `count`+`save` fuera de
transacción; el índice parcial único resuelve la carrera de defaults
sin corrupción (aborta uno → 500 aislado). Paridad lat/lng no
exigida — la app manda ambas o ninguna.
