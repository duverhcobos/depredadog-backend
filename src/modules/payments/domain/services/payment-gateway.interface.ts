export interface InitiatePushCommand {
  /** Monto en centavos? — NO: el dominio maneja pesos enteros (numeric(10,2)). */
  amount: number;
  /** Celular colombiano que recibe el push (3XX XXX XXXX, plano). */
  payerPhone: string;
  /** Referencia idempotente del lado del negocio — clientRequestId
   * cuando el cliente la mandó; el adapter la usa como llave externa. */
  referenceHint?: string;
}

export interface PushDispatchResult {
  /** 'sim' en dev; 'nequi' con las llaves reales. */
  provider: string;
  /** Id de transacción del proveedor — llave del webhook. */
  reference: string;
}

// Puerto del proveedor de cobro por push (Nequi "Pagos con Push").
// Solo sabe despachar el cobro — la resolución llega por webhook y es
// responsabilidad del dueño del agregado (orders).
// El adapter Nequi real (pendiente 010) implementa esta misma forma:
// mismo método, otro binding en el módulo.
export interface IPaymentGateway {
  initiatePush(cmd: InitiatePushCommand): Promise<PushDispatchResult>;
}

export const PAYMENT_GATEWAY = Symbol('IPaymentGateway');
