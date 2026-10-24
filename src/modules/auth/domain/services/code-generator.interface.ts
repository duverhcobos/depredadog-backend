export interface ICodeGenerator {
  generateVerificationCode(): string;
  generateSessionToken(): { token: string; tokenHash: string };
  generateReferralCode(): string;
  hashToken(token: string): string;
}

export const CODE_GENERATOR = Symbol('ICodeGenerator');
