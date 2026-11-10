import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, QueryFailedError, Repository } from 'typeorm';
import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyRegisteredException } from '../../domain/exceptions/email-already-registered.exception';
import { GoogleAccountAlreadyLinkedException } from '../../domain/exceptions/google-account-already-linked.exception';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';

interface PgDriverError {
  code?: string;
  constraint?: string;
}

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(@InjectRepository(User) private readonly orm: Repository<User>) { }

  findById(id: string): Promise<User | null> {
    return this.orm.findOne({ where: { id, deletedAt: IsNull() } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.orm.findOne({
      where: { email: email.toLowerCase(), deletedAt: IsNull() },
    });
  }

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.orm.findOne({ where: { googleId, deletedAt: IsNull() } });
  }

  findByReferralCode(code: string): Promise<User | null> {
    return this.orm.findOne({
      where: { referralCode: code, deletedAt: IsNull() },
    });
  }

  // id → "Nombre Apellido" en una sola query IN — el admin ve quién
  // pidió en la cola sin exponer la entidad entera.
  async findNamesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.orm.find({
      where: { id: In(ids), deletedAt: IsNull() },
      select: { id: true, firstName: true, firstLastName: true },
    });
    return new Map(
      rows.map((u) => [u.id, `${u.firstName} ${u.firstLastName}`.trim()]),
    );
  }

  async save(user: User): Promise<User> {
    try {
      return await this.orm.save(user);
    } catch (error) {
      const driverError =
        error instanceof QueryFailedError
          ? (error as { driverError: PgDriverError }).driverError
          : undefined;
      if (driverError?.code === '23505') {
        if (driverError.constraint === 'uq_users_email') {
          throw new EmailAlreadyRegisteredException();
        }
        if (driverError.constraint === 'uq_users_google_id') {
          throw new GoogleAccountAlreadyLinkedException();
        }
      }
      throw error;
    }
  }
}
