export interface IEmailSender {
  sendVerificationCode(email: string, code: string): Promise<void>;
  sendPasswordResetCode(email: string, code: string): Promise<void>;
}

export const EMAIL_SENDER = Symbol('IEmailSender');
