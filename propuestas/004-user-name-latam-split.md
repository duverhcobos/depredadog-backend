# Propuesta 004: Split de nombre LatAm — 4 campos en `users`

Decisión del usuario (vino del diseño del formulario de registro en la app):
el nombre se modela al estilo latinoamericano — "Juan Carlos Pérez García"
o simplemente "Juan Pérez", ambos válidos:

| Campo | Obligatorio |
|---|---|
| Primer nombre | **Sí** |
| Segundo nombre | Opcional |
| Primer apellido | **Sí** (nuevo — antes `last_name` era NULL) |
| Segundo apellido | Opcional |

**Hoy**: `first_name` NOT NULL + `last_name` NULL (apellido único y
opcional). Se requieren migración, cambio de entidad/DTOs/mapper y ajuste
del Google login. Es **breaking change del contrato** `UserResponseDto`
(login, verify-email, register, me devuelven el user) — el app se ajusta
en su propio ciclo después de esta propuesta.

**Decisión embebida (a confirmar en encuesta): naming en inglés.** El
modelo usa identificadores en inglés — las opciones para los 4 campos:

| Opción | Campos |
|---|---|
| **A (recomendada)** | `firstName`, `secondName`, `firstLastName`, `secondLastName` — espejo directo del español sin afirmar paterno/materno |
| B | `firstName`, `middleName`, `firstSurname`, `secondSurname` — "surname" = apellido preciso; `middleName` convención anglo |
| C | `firstName`, `middleName`, `paternalLastName`, `maternalLastName` — semántica LatAm explícita pero segundo apellido no siempre es materno |

La migración asume la opción elegida con los nombres de columna
equivalentes (`second_name`, `first_last_name`, `second_last_name`).

## Desviaciones del modelo de datos (`modelo-evolucion`)

`users` pasa de 2 a 4 columnas de nombre — `documentacion/modelo-de-datos.md`
se actualiza en esta misma propuesta:

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| `first_name` | varchar(100) | NOT NULL | Primer nombre |
| `second_name` | varchar(100) | NULL | **Nueva** — segundo nombre |
| `first_last_name` | varchar(100) | NOT NULL | **Renombrada** de `last_name` + ahora NOT NULL — primer apellido |
| `second_last_name` | varchar(100) | NULL | **Nueva** — segundo apellido |

`last_name` desaparece — la migración renombra la columna (los datos de
dev sobreviven; nulls → `''` antes del NOT NULL).

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/infrastructure/database/migrations/<ts>-SplitUserNameLatam.ts` | **Nueva** — rename `last_name`→`first_last_name` (nulls→`''`, NOT NULL) + 2 columnas NULL nuevas |
| `src/infrastructure/database/schemas/user.schema.ts` | Actualizar — 4 columnas |
| `src/modules/auth/domain/entities/user.entity.ts` | Actualizar — 4 campos (`firstName`, `secondName?`, `firstLastName`, `secondLastName?`) |
| `src/modules/auth/application/dtos/register.dto.ts` | `firstName` req + `secondName?` + `firstLastName` req (era `lastName?`) + `secondLastName?` |
| `src/modules/auth/application/dtos/user-response.dto.ts` | Exponer los 4 campos |
| `src/modules/auth/application/mappers/auth.mapper.ts` + `.spec.ts` | Mapear los 4 campos |
| `src/modules/auth/application/use-cases/register.use-case.ts` + `.spec.ts` | Asignar 4 campos |
| `src/modules/auth/application/use-cases/google-login.use-case.ts` + `.spec.ts` | `givenName`→firstName, `familyName`→firstLastName, resto NULL |
| `documentacion/modelo-de-datos.md` | Actualizar tabla `users` |
| `documentacion/api/auth/001-post-register.md` | Actualizar contrato (api-docs) |
| `documentacion/api/auth/007-get-me.md` | Actualizar user de respuesta |
| `test/auth/register.e2e-spec.ts` | Actualizar payloads + asserts |
| `test/auth/me.e2e-spec.ts` | Actualizar asserts del user |
| `test/support/e2e-app.ts` | Helper de creación de usuarios con 4 campos |

## Detalles de implementación

### Migración `SplitUserNameLatam`

```ts
public async up(queryRunner: QueryRunner): Promise<void> {
  // Datos existentes: nulls → '' antes de exigir NOT NULL (dev tiene
  // pocos registros; en prod se decidiría backfill explícito).
  await queryRunner.query(
    `UPDATE "users" SET "last_name" = '' WHERE "last_name" IS NULL`,
  );
  await queryRunner.renameColumn('users', 'last_name', 'first_last_name');
  await queryRunner.changeColumn(
    'users',
    'first_last_name',
    new TableColumn({
      name: 'first_last_name',
      type: 'varchar',
      length: '100',
      isNullable: false,
    }),
  );
  await queryRunner.addColumns('users', [
    new TableColumn({
      name: 'second_name',
      type: 'varchar',
      length: '100',
      isNullable: true,
    }),
    new TableColumn({
      name: 'second_last_name',
      type: 'varchar',
      length: '100',
      isNullable: true,
    }),
  ]);
}

public async down(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.dropColumn('users', 'second_last_name');
  await queryRunner.dropColumn('users', 'second_name');
  await queryRunner.changeColumn(
    'users',
    'first_last_name',
    new TableColumn({
      name: 'first_last_name',
      type: 'varchar',
      length: '100',
      isNullable: true,
    }),
  );
  await queryRunner.renameColumn('users', 'first_last_name', 'last_name');
}
```

(`migrations-workflow`: probar `up` + `revert` en dev y en la BD de test.)

### `RegisterDto` (nueva forma del nombre)

```ts
@IsString()
@Length(1, 100)
@Matches(/\S/)
firstName!: string;

@IsOptional()
@IsString()
@MaxLength(100)
secondName?: string;

// Primer apellido — ahora OBLIGATORIO (antes lastName era opcional):
// convención LatAm decidida por el usuario.
@IsString()
@Length(1, 100)
@Matches(/\S/)
firstLastName!: string;

@IsOptional()
@IsString()
@MaxLength(100)
secondLastName?: string;
```

(`lastName` desaparece del DTO — los e2e que lo mandaban se actualizan.)

### `google-login.use-case.ts`

`profile.givenName` → `firstName`; `profile.familyName` → `firstLastName`
(con fallback como hoy — Google no garantiza family_name). `secondName`/
`secondLastName` quedan NULL (Google no los distingue).

### `UserResponseDto` / mapper / entity

Los 4 campos nuevos en los tres archivos — mismo patrón que hoy
(`firstName`, `secondName: string | null`, `firstLastName`,
`secondLastName: string | null`).

## Orden de aplicación

1. Migración + schema + entity → correr `up`/`down` en dev.
2. Entity → DTOs → mapper → use cases (register + google) → docs.
3. `documentacion/modelo-de-datos.md` + api docs de register/me.
4. Specs + e2e (`npm run build`, `npm run test`, `npm run test:e2e`).
5. El app Flutter ajusta `UserModel` en su propia propuesta después
   (los campos viejos `firstName`/`lastName` ya no vendrán).
