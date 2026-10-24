import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceFingerprint?: string;

  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: string;
}
