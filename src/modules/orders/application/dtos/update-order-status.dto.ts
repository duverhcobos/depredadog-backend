import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// DECISIÓN USUARIO: 'preparing' NO va — el dueño hace todo (cocina +
// entrega), el intermedio no le dice nada. El flujo real es
// pending → confirmed → done. El miembro del enum se queda (la app ya
// lo mapea y la migración no se toca) pero ninguna transición lo
// produce — queda inalcanzable por contrato.
export class UpdateOrderStatusDto {
  @IsIn(['confirmed', 'done', 'cancelled'])
  to!: 'confirmed' | 'done' | 'cancelled';

  /** Solo con to='cancelled' — razón user-facing en español. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cancelReason?: string;
}
