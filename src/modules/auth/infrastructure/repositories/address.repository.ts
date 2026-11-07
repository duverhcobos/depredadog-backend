import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Not, Repository } from 'typeorm';
import { Address } from '../../domain/entities/address.entity';
import { IAddressRepository } from '../../domain/repositories/address.repository.interface';

@Injectable()
export class AddressRepository implements IAddressRepository {
  constructor(
    @InjectRepository(Address) private readonly orm: Repository<Address>,
  ) { }

  findAllByUserId(userId: string): Promise<Address[]> {
    return this.orm.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  }

  findByIdForUser(id: string, userId: string): Promise<Address | null> {
    return this.orm.findOne({ where: { id, userId } });
  }

  countByUserId(userId: string): Promise<number> {
    return this.orm.count({ where: { userId } });
  }

  save(address: Address): Promise<Address> {
    return this.orm.save(address);
  }

  saveAsExclusiveDefault(address: Address): Promise<Address> {
    // uq_addresses_default NO es deferrable — hay que apagar las
    // demás ANTES de grabar la nueva default o el insert/update
    // choca con el índice parcial único. Solo se tocan las que
    // tienen el flag prendido (y no la propia), así las hermanas ya
    // apagadas no reciben bump de updated_at. La entidad llega
    // detached (cargada antes de la tx) y el save escribiría su
    // updatedAt viejo — se refresca explícito.
    address.updatedAt = new Date();
    return this.orm.manager.transaction(async (em) => {
      const criteria: FindOptionsWhere<Address> = {
        userId: address.userId,
        isDefault: true,
      };
      if (address.id) {
        criteria.id = Not(address.id);
      }
      await em.update(Address, criteria, { isDefault: false });
      return em.save(address);
    });
  }

  async delete(address: Address): Promise<void> {
    await this.orm.manager.transaction(async (em) => {
      const wasDefault = address.isDefault;
      const userId = address.userId;
      await em.remove(address);
      if (!wasDefault) return;
      // §014 — la más antigua hereda la default: la preselección del
      // checkout sobrevive al borrado.
      const oldest = await em.findOne(Address, {
        where: { userId },
        order: { createdAt: 'ASC' },
      });
      if (oldest) {
        oldest.isDefault = true;
        oldest.updatedAt = new Date();
        await em.save(oldest);
      }
    });
  }
}
