import { User } from '../entities/user.entity';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByGoogleId(googleId: string): Promise<User | null>;
  findByReferralCode(code: string): Promise<User | null>;
  /** id → nombre visible, para enriquecer la cola admin (una query IN). */
  findNamesByIds(ids: string[]): Promise<Map<string, string>>;
  save(user: User): Promise<User>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');
