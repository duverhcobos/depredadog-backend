import { DomainException } from '../../../../common/exceptions/domain.exception';

// 409: la transición pedida no está en la matriz del kanban
// (§022 — pending→confirmed→preparing→ready→done + cancelled) o
// alguien movió la orden entre la lectura y el write (claim
// condicional perdido).
export class InvalidStatusTransitionException extends DomainException {
  constructor() {
    super('Order cannot move to that status', 409, 'INVALID_STATUS_TRANSITION');
  }
}
