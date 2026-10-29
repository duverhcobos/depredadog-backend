import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @Length(1, 100)
  @Matches(/\S/)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  secondName?: string;

  // Primer apellido — ahora OBLIGATORIO (lastName era opcional):
  // convención LatAm decidida por el usuario.
  @IsString()
  @Length(1, 100)
  @Matches(/\S/)
  firstLastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  secondLastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  referralCode?: string;

  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceFingerprint?: string;

  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: string;
}
