import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

// Misma forma que ListOrdersQueryDto: 'active' es la cola viva del
// local (sin paginar — acotada por naturaleza), 'history' pagina.
export class ListAdminOrdersQueryDto {
  @IsIn(['active', 'history'])
  @IsOptional()
  bucket: 'active' | 'history' = 'active';

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page = 1;

  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  @Type(() => Number)
  limit = 20;
}
