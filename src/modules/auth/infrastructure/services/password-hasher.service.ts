import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { IPasswordHasher } from '../../domain/services/password-hasher.interface';

const SALT_ROUNDS = 10;

@Injectable()
export class PasswordHasherService implements IPasswordHasher {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plain, hash);
    } catch {
      return false;
    }
  }
}
