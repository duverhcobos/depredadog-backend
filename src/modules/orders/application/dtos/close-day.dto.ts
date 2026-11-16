import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CloseDayDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
