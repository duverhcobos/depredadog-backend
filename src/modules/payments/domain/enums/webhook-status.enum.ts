// Estados normalizados del webhook de pagos — el adapter de cada
// proveedor traduce los suyos a este vocabulario del dominio antes de
// tocar orders (sim y los tests ya hablan estos nombres; Nequi
// mapeará los suyos en su gateway — pendiente 010).
export const WEBHOOK_STATUSES = [
  'approved',
  'rejected',
  'expired',
  'cancelled',
] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];
