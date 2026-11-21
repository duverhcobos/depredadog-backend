import { Promotion } from '../entities/promotion.entity';
import { PromotionKind } from '../enums/promotion-kind.enum';
import {
  EvaluableOrderItem,
  PromotionEvaluator,
} from './promotion-evaluator.service';

// La carta del dueño (§027) tal como quedó sembrada — los specs usan
// los mismos ids lógicos: perros d1..d6 (cachorro = d1), papas 'papas'.
const DOGS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
const PAPAS = 'papas';
const CACHORRO = 'd1';

function promo(slug: string, kind: PromotionKind, config: object): Promotion {
  const p = new Promotion();
  p.slug = slug;
  p.name = 'Promo ' + slug;
  p.tagline = null;
  p.kind = kind;
  p.config = config;
  p.isActive = true;
  p.sortOrder = 0;
  return p;
}

const comboCachorro = () =>
  promo('combo-cachorro', PromotionKind.FIXED_BUNDLE, {
    items: [
      { productId: CACHORRO, qty: 1 },
      { productId: PAPAS, qty: 1 },
    ],
    price: 17000,
  });
const papasGratis = () =>
  promo('papas-gratis', PromotionKind.FREE_ITEM, {
    eligibleProductIds: DOGS,
    minQty: 2,
    maxQty: 3,
    freeProductId: PAPAS,
    freeQty: 1,
  });
const duoAlfa = () =>
  promo('duo-alfa', PromotionKind.SHOWCASE, {
    items: [{ productId: 'd6', qty: 2 }],
    priceLabel: '$36.000',
  });
const manada15 = () =>
  promo('manada-15', PromotionKind.PERCENT_OFF, {
    eligibleProductIds: DOGS,
    minQty: 4,
    percent: 15,
    roundDownTo: 500,
  });
const carta = () => [comboCachorro(), papasGratis(), duoAlfa(), manada15()];

// Ítem construido al estilo del builder: unitPrice = base + Σ deltas,
// lineTotal = unitPrice × qty. `mods` = deltas de added (removed: 0).
function item(
  productId: string,
  quantity: number,
  basePrice: number,
  addedDeltas: number[] = [],
): EvaluableOrderItem {
  const modifiers = addedDeltas.map((d) => ({
    action: 'added',
    priceDelta: d,
  }));
  const unitPrice = basePrice + addedDeltas.reduce((s, d) => s + d, 0);
  return {
    productId,
    quantity,
    unitPrice,
    lineTotal: unitPrice * quantity,
    modifiers,
  };
}

describe('PromotionEvaluator (§027)', () => {
  const evaluator = new PromotionEvaluator();
  const noPrices = new Map<string, number>();
  const papasPrice = new Map([[PAPAS, 5000]]);

  describe('fixed_bundle — combo-cachorro', () => {
    it('cachorro + papas → ahorro 2000 (14.000+5.000−17.000)', () => {
      const r = evaluator.evaluate(
        [item(CACHORRO, 1, 14000), item(PAPAS, 1, 5000)],
        carta(),
        noPrices,
      );
      expect(r.discount).toBe(2000);
      expect(r.appliedPromotions).toEqual([
        { slug: 'combo-cachorro', name: 'Promo combo-cachorro', saving: 2000 },
      ]);
      expect(r.extraItems).toEqual([]);
    });

    it('extras en el perro no cambian el ahorro — el bundle cubre solo los base', () => {
      const r = evaluator.evaluate(
        [item(CACHORRO, 1, 14000, [3500, 3500]), item(PAPAS, 1, 5000)],
        carta(),
        noPrices,
      );
      // La mozzarella ×2 suma normal en la línea; el ahorro sigue 2000.
      expect(r.discount).toBe(2000);
      expect(r.appliedPromotions[0].slug).toBe('combo-cachorro');
    });

    it('falta un componente → no aplica', () => {
      const r = evaluator.evaluate(
        [item(CACHORRO, 1, 14000), item('d2', 1, 15000)],
        carta(),
        noPrices,
      );
      expect(r.discount).toBe(0);
      expect(r.appliedPromotions).toEqual([]);
    });

    it('dos sets completos → ahorro × 2', () => {
      // Solo el bundle en la carta — con papas-gratis activa los 2
      // perros dispararían primero el free_item (precedencia).
      const r = evaluator.evaluate(
        [item(CACHORRO, 2, 14000), item(PAPAS, 2, 5000)],
        [comboCachorro()],
        noPrices,
      );
      expect(r.discount).toBe(4000);
      expect(r.appliedPromotions[0].saving).toBe(4000);
    });

    it('bundle que no ahorra (price ≥ suelto) → no dispara', () => {
      const mal = promo('bundle-malo', PromotionKind.FIXED_BUNDLE, {
        items: [{ productId: CACHORRO, qty: 1 }],
        price: 20000,
      });
      const r = evaluator.evaluate([item(CACHORRO, 1, 14000)], [mal], noPrices);
      expect(r.discount).toBe(0);
      expect(r.appliedPromotions).toEqual([]);
    });
  });

  describe('free_item — papas-gratis', () => {
    it('2 perros sin papas → papas inyectada (saving 5000 + extraItem)', () => {
      const r = evaluator.evaluate(
        [item('d2', 1, 15000), item('d5', 1, 17000)],
        carta(),
        papasPrice,
      );
      expect(r.discount).toBe(5000);
      expect(r.appliedPromotions).toEqual([
        { slug: 'papas-gratis', name: 'Promo papas-gratis', saving: 5000 },
      ]);
      expect(r.extraItems).toEqual([
        { productId: PAPAS, quantity: 1, promotionSlug: 'papas-gratis' },
      ]);
    });

    it('quantity 2 en una línea también cuenta como 2 unidades', () => {
      const r = evaluator.evaluate([item('d2', 2, 15000)], carta(), papasPrice);
      expect(r.discount).toBe(5000);
      expect(r.extraItems).toHaveLength(1);
    });

    it('2 perros + 1 papas → cubre la línea, sin inyección (5000)', () => {
      const r = evaluator.evaluate(
        [item('d2', 1, 15000), item('d3', 1, 16000), item(PAPAS, 1, 5000)],
        carta(),
        noPrices, // sin mapa — el precio se deriva de la línea misma
      );
      expect(r.discount).toBe(5000);
      expect(r.extraItems).toEqual([]);
    });

    it('2 perros + 2 papas → sigue 5000 (1 gratis + 1 pagada)', () => {
      const r = evaluator.evaluate(
        [item('d2', 2, 15000), item(PAPAS, 2, 5000)],
        carta(),
        noPrices,
      );
      expect(r.discount).toBe(5000);
    });

    it('2 perros + papas con extra → el ahorro cubre el base, el extra cobra', () => {
      const r = evaluator.evaluate(
        [
          item('d2', 2, 15000),
          item(PAPAS, 1, 5000, [2000]), // tocineta en las papas
        ],
        carta(),
        noPrices,
      );
      // unitBase de papas = 7000−2000 = 5000 → saving 5000.
      expect(r.discount).toBe(5000);
    });

    it('3 perros → aplica (tope del rango); el free cubre solo 1× papas', () => {
      const r = evaluator.evaluate(
        [item('d2', 1, 15000), item('d3', 1, 16000), item('d4', 1, 16000)],
        carta(),
        papasPrice,
      );
      expect(r.discount).toBe(5000);
      expect(r.extraItems).toHaveLength(1);
    });

    it('1 perro → no aplica', () => {
      const r = evaluator.evaluate([item('d2', 1, 15000)], carta(), papasPrice);
      expect(r.discount).toBe(0);
      expect(r.extraItems).toEqual([]);
    });

    it('freeProduct sin precio resoluble → la promo no dispara', () => {
      const r = evaluator.evaluate(
        [item('d2', 2, 15000)],
        carta(),
        noPrices, // papas no está en el pedido ni en el mapa
      );
      expect(r.discount).toBe(0);
      expect(r.appliedPromotions).toEqual([]);
      expect(r.extraItems).toEqual([]);
    });
  });

  describe('percent_off — manada-15', () => {
    it('4 perros → 15% de sus lineTotals redondeado a $500 hacia abajo', () => {
      // 4 × 14.000 = 56.000 → 8.400 → floor a 8.000.
      const r = evaluator.evaluate([item('d1', 4, 14000)], carta(), papasPrice);
      expect(r.discount).toBe(8000);
      expect(r.appliedPromotions).toEqual([
        { slug: 'manada-15', name: 'Promo manada-15', saving: 8000 },
      ]);
      expect(r.extraItems).toEqual([]);
    });

    it('el −15% incluye los extras de modificadores (el perro completo)', () => {
      // 2×16.000 + 2×(18.000+2.000 extra) = 72.000 → 10.800 → 10.500.
      const r = evaluator.evaluate(
        [item('d2', 2, 16000), item('d6', 2, 18000, [2000])],
        carta(),
        papasPrice,
      );
      expect(r.discount).toBe(10500);
    });

    it('bebidas / & más jamás descuentan ni cuentan al umbral', () => {
      // 3 perros + bebida + papas: solo 3 elegibles → papas-gratis, no
      // manada; y el % nunca toca la bebida.
      const r = evaluator.evaluate(
        [
          item('d2', 2, 15000),
          item('d3', 1, 16000),
          item('bebida', 2, 3000),
          item(PAPAS, 1, 5000),
        ],
        carta(),
        papasPrice,
      );
      expect(r.discount).toBe(5000);
      expect(r.appliedPromotions[0].slug).toBe('papas-gratis');
    });

    it('3 perros → no alcanza el tier', () => {
      const r = evaluator.evaluate([item('d2', 3, 15000)], carta(), papasPrice);
      // cayó al tier free_item (3 ∈ [2,3]) — manada no aplica.
      expect(r.appliedPromotions.map((a) => a.slug)).toEqual(['papas-gratis']);
    });
  });

  describe('precedencia y tiers excluyentes', () => {
    it('4 perros → solo manada (papas-gratis NO stackea)', () => {
      const r = evaluator.evaluate([item('d2', 4, 15000)], carta(), papasPrice);
      expect(r.appliedPromotions.map((a) => a.slug)).toEqual(['manada-15']);
      expect(r.extraItems).toEqual([]); // sin papas gratis a 4+
    });

    it('4 perros + papas pedida → manada consume los perros; la papas queda pagada', () => {
      const r = evaluator.evaluate(
        [item('d2', 4, 15000), item(PAPAS, 1, 5000)],
        carta(),
        papasPrice,
      );
      // 4×15.000 = 60.000 → 9.000 exacto (ya es múltiplo de 500).
      expect(r.discount).toBe(9000);
      expect(r.appliedPromotions.map((a) => a.slug)).toEqual(['manada-15']);
    });

    it('3 perros (uno cachorro) + papas → free_item gana al bundle; la papas queda cubierta', () => {
      const r = evaluator.evaluate(
        [item(CACHORRO, 1, 14000), item('d3', 2, 16000), item(PAPAS, 1, 5000)],
        carta(),
        noPrices,
      );
      // La regla cubre la papas (5000) — mejor que el bundle (2000).
      expect(r.discount).toBe(5000);
      expect(r.appliedPromotions.map((a) => a.slug)).toEqual(['papas-gratis']);
    });

    it('cada unidad se consume una vez — las promos no compiten por el mismo perro', () => {
      // 2 líneas del mismo producto: 2+2 unidades → 4 → manada.
      const r = evaluator.evaluate(
        [item('d2', 2, 15000), item('d2', 2, 15000)],
        carta(),
        papasPrice,
      );
      expect(r.appliedPromotions.map((a) => a.slug)).toEqual(['manada-15']);
      // 4×15.000 = 60.000 → 9.000.
      expect(r.discount).toBe(9000);
    });

    it('respeta la precedencia aunque el array venga desordenado', () => {
      const r = evaluator.evaluate(
        [item('d2', 4, 15000)],
        [papasGratis(), manada15()], // free_item primero en el array
        papasPrice,
      );
      // El motor ordena por kind: percent antes que free.
      expect(r.appliedPromotions.map((a) => a.slug)).toEqual(['manada-15']);
    });
  });

  describe('showcase y casos base', () => {
    it('showcase nunca se evalúa', () => {
      const r = evaluator.evaluate(
        [item('d6', 2, 18000)],
        [duoAlfa()],
        noPrices,
      );
      expect(r.discount).toBe(0);
      expect(r.appliedPromotions).toEqual([]);
    });

    it('pedido sin nada aplicable → discount 0, appliedPromotions []', () => {
      const r = evaluator.evaluate(
        [item('bebida', 2, 3000)],
        carta(),
        papasPrice,
      );
      expect(r.discount).toBe(0);
      expect(r.appliedPromotions).toEqual([]);
      expect(r.extraItems).toEqual([]);
    });

    it('sin promos → todo en cero', () => {
      const r = evaluator.evaluate(
        [item(CACHORRO, 1, 14000), item(PAPAS, 1, 5000)],
        [],
        noPrices,
      );
      expect(r.discount).toBe(0);
      expect(r.appliedPromotions).toEqual([]);
    });
  });

  // Config corrupta (jsonb editado a mano): la promo se SALTA —
  // nunca NaN, nunca negativo, nunca excepción en el pedido.
  describe('config corrupta → promo saltada', () => {
    it('percent > 100 → no dispara', () => {
      const r = evaluator.evaluate(
        [item('d1', 4, 14000)],
        [
          promo('manada-rota', PromotionKind.PERCENT_OFF, {
            eligibleProductIds: DOGS,
            minQty: 4,
            percent: 150,
            roundDownTo: 500,
          }),
        ],
        noPrices,
      );
      expect(r.discount).toBe(0);
      expect(r.appliedPromotions).toEqual([]);
    });

    it('roundDownTo 0 → no NaN, no dispara', () => {
      const r = evaluator.evaluate(
        [item('d1', 4, 14000)],
        [
          promo('manada-rota', PromotionKind.PERCENT_OFF, {
            eligibleProductIds: DOGS,
            minQty: 4,
            percent: 15,
            roundDownTo: 0,
          }),
        ],
        noPrices,
      );
      expect(r.discount).toBe(0);
      expect(r.appliedPromotions).toEqual([]);
    });

    it('minQty negativo → no dispara en pedido vacío de elegibles', () => {
      const r = evaluator.evaluate(
        [item('bebida', 1, 3000)],
        [
          promo('free-roto', PromotionKind.FREE_ITEM, {
            eligibleProductIds: DOGS,
            minQty: -1,
            freeProductId: PAPAS,
            freeQty: 1,
          }),
        ],
        papasPrice,
      );
      expect(r.discount).toBe(0);
      expect(r.appliedPromotions).toEqual([]);
    });

    it('bundle sin price → no dispara (nunca "gratis")', () => {
      const r = evaluator.evaluate(
        [item(CACHORRO, 1, 14000), item(PAPAS, 1, 5000)],
        [
          promo('bundle-roto', PromotionKind.FIXED_BUNDLE, {
            items: [
              { productId: CACHORRO, qty: 1 },
              { productId: PAPAS, qty: 1 },
            ],
          }),
        ],
        noPrices,
      );
      expect(r.discount).toBe(0);
      expect(r.appliedPromotions).toEqual([]);
    });

    it('bundle price null → no dispara', () => {
      const r = evaluator.evaluate(
        [item(CACHORRO, 1, 14000), item(PAPAS, 1, 5000)],
        [
          promo('bundle-roto', PromotionKind.FIXED_BUNDLE, {
            items: [
              { productId: CACHORRO, qty: 1 },
              { productId: PAPAS, qty: 1 },
            ],
            price: null,
          }),
        ],
        noPrices,
      );
      expect(r.discount).toBe(0);
      expect(r.appliedPromotions).toEqual([]);
    });

    it('config null → no lanza, no dispara', () => {
      const r = evaluator.evaluate(
        [item('d1', 4, 14000)],
        [promo('nula', PromotionKind.PERCENT_OFF, null!)],
        noPrices,
      );
      expect(r.discount).toBe(0);
      expect(r.appliedPromotions).toEqual([]);
    });

    it('freeQty parcial: pedido trae 1 de 2 → inyecta solo la faltante', () => {
      const r = evaluator.evaluate(
        [item('d2', 2, 15000), item(PAPAS, 1, 5000)],
        [
          promo('papas-x2', PromotionKind.FREE_ITEM, {
            eligibleProductIds: DOGS,
            minQty: 2,
            freeProductId: PAPAS,
            freeQty: 2,
          }),
        ],
        papasPrice,
      );
      expect(r.discount).toBe(10000);
      expect(r.extraItems).toEqual([
        { productId: PAPAS, quantity: 1, promotionSlug: 'papas-x2' },
      ]);
    });
  });
});
