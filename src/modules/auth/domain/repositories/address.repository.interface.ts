import { Address } from '../entities/address.entity';

export interface IAddressRepository {
  /** Default primero, luego por antigüedad — orden del checkout. */
  findAllByUserId(userId: string): Promise<Address[]>;
  /** IDOR-safe: null si no existe O si no es del usuario. */
  findByIdForUser(id: string, userId: string): Promise<Address | null>;
  countByUserId(userId: string): Promise<number>;
  save(address: Address): Promise<Address>;
  /**
   * Guarda marcando `is_default` y, en la MISMA transacción, apaga el
   * flag del resto del usuario — respalda el índice parcial único
   * `uq_addresses_default`.
   */
  saveAsExclusiveDefault(address: Address): Promise<Address>;
  /**
   * Borra la fila; si era la default y quedan direcciones, promueve
   * la más antigua en la misma transacción — el checkout siempre
   * conserva preselección.
   */
  delete(address: Address): Promise<void>;
}

export const ADDRESS_REPOSITORY = Symbol('IAddressRepository');
