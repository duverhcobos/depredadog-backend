// Mecánica de la promoción (§027). `showcase` es una card
// presentacional del rail — nunca se evalúa: su oferta la cubre
// otra promoción real (duo-alfa → papas-gratis).
export enum PromotionKind {
  FIXED_BUNDLE = 'fixed_bundle',
  FREE_ITEM = 'free_item',
  PERCENT_OFF = 'percent_off',
  SHOWCASE = 'showcase',
}
