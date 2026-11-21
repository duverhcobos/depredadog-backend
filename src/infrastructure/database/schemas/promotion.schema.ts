import { EntitySchema } from 'typeorm';
import { Promotion } from '../../../modules/promotions/domain/entities/promotion.entity';
import { PromotionKind } from '../../../modules/promotions/domain/enums/promotion-kind.enum';

// Ofertas de la carta (§027): reglas sobre el contenido del pedido —
// combos fijos, regalos por umbral y descuentos por volumen. La
// mecánica vive en `config` (jsonb interpretado por kind).
export const PromotionSchema = new EntitySchema<Promotion>({
  name: 'Promotion',
  target: Promotion,
  tableName: 'promotions',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    slug: { type: 'varchar', length: 60 },
    name: { type: 'varchar', length: 120 },
    tagline: { type: 'varchar', length: 200, nullable: true },
    kind: { type: 'enum', enum: PromotionKind, enumName: 'promotion_kind' },
    config: { type: 'jsonb' },
    isActive: { name: 'is_active', type: 'boolean', default: true },
    sortOrder: { name: 'sort_order', type: 'int', default: 0 },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
