import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'crypto';
import { ICodeGenerator } from '../../domain/services/code-generator.interface';

const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERRAL_LENGTH = 8;

@Injectable()
export class CodeGeneratorService implements ICodeGenerator {
  generateVerificationCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  generateSessionToken(): { token: string; tokenHash: string } {
    const token = randomBytes(48).toString('base64url');
    return { token, tokenHash: this.hashToken(token) };
  }

  generateReferralCode(): string {
    let code = '';
    for (let i = 0; i < REFERRAL_LENGTH; i++) {
      code += REFERRAL_ALPHABET[randomInt(0, REFERRAL_ALPHABET.length)];
    }
    return code;
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
