import { createHash } from 'crypto';
import { CodeGeneratorService } from './code-generator.service';

describe('CodeGeneratorService', () => {
  const gen = new CodeGeneratorService();

  it('genera códigos de 6 dígitos', () => {
    for (let i = 0; i < 50; i++) {
      expect(gen.generateVerificationCode()).toMatch(/^\d{6}$/);
    }
  });

  it('generateSessionToken devuelve token opaco + su sha256', () => {
    const { token, tokenHash } = gen.generateSessionToken();
    expect(token.length).toBeGreaterThan(40);
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
  });

  it('generateReferralCode usa alfabeto sin ambiguos y largo 8', () => {
    const code = gen.generateReferralCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(code).not.toMatch(/[01IO]/);
  });
});
