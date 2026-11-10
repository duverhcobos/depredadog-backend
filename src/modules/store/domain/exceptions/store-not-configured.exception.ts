import { DomainException } from '../../../../common/exceptions/domain.exception';

// Sin fila de store_settings el negocio no está configurado — fallo de
// despliegue, no del cliente → 404 explícito (la app muestra su estado
// de error; nunca un "abierto" falso).
export class StoreNotConfiguredException extends DomainException {
  constructor() {
    super('Store is not configured', 404, 'STORE_NOT_CONFIGURED');
  }
}
