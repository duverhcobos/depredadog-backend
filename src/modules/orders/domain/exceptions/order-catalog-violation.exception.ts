import { DomainException } from '../../../../common/exceptions/domain.exception';

// 409: la revalidación detectó producto/modificador inválido o
// agotado. El mensaje dice QUÉ falló (la app lo muestra y refresca la
// carta).
export class OrderCatalogViolationException extends DomainException {
  constructor(detail: string) {
    super(
      `Order rejected by catalog: ${detail}`,
      409,
      'ORDER_CATALOG_VIOLATION',
    );
  }
}
