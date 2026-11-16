import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Kanban §022: la matriz es pending→confirmed→preparing→ready→done +
// cancelled desde cualquier no terminal. La app etiqueta 'ready' por
// serviceType ("Va en camino"/"Servido"/"Listo p/recoger").
export class UpdateOrderStatusDto {
  @IsIn(['confirmed', 'preparing', 'ready', 'done', 'cancelled'])
  to!: 'confirmed' | 'preparing' | 'ready' | 'done' | 'cancelled';

  /** Solo con to='cancelled' — razón user-facing en español. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cancelReason?: string;
}
