import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class VerifyEmailDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceFingerprint?: string;

  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: string;
}
