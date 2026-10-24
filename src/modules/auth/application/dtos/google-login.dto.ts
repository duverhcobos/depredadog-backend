import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  idToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceFingerprint?: string;

  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: string;
}
