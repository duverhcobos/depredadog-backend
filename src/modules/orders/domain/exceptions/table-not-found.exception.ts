import { DomainException } from '../../../../common/exceptions/domain.exception';

// 404: la mesa del pedido dine_in no existe o está inactiva.
export class TableNotFoundException extends DomainException {
  constructor() {
    super('Table not found', 404, 'TABLE_NOT_FOUND');
  }
}
