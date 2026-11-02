import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../../common/logger/logger.service';
import { IEmailSender } from '../../domain/services/email-sender.interface';

interface ResendResponse {
  id?: string;
  message?: string;
}

@Injectable()
export class EmailSenderService implements IEmailSender {
  constructor(
    private readonly logger: LoggerService,
    private readonly config: ConfigService,
  ) { }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    await this.send(
      email,
      'Your Depredadog verification code',
      `<p>Your verification code is <strong>${code}</strong>. It expires in 15 minutes.</p>`,
      () => this.logCode('verification', email, code),
    );
  }

  async sendPasswordResetCode(email: string, code: string): Promise<void> {
    await this.send(
      email,
      'Your Depredadog password reset code',
      `<p>Your password reset code is <strong>${code}</strong>. It expires in 15 minutes.</p>`,
      () => this.logCode('password reset', email, code),
    );
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    fallback: () => void,
  ): Promise<void> {
    const apiKey = this.config.get<string>('email.resendApiKey');
    if (!apiKey) {
      if (this.config.get<boolean>('app.isProduction')!) {
        // Prod sin RESEND_API_KEY: error de ops SIN código ni email (no se filtran secretos)
        this.logger.error(
          'RESEND_API_KEY missing in production — email delivery disabled',
          undefined,
          'EmailSenderService',
        );
        throw new Error('Email delivery not configured');
      }
      // Dev sin API key: fallback — el código queda en el log
      fallback();
      return;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.get<string>('email.from')!,
        to,
        subject,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ResendResponse;
      this.logger.error(
        `Resend failed (${response.status}): ${body.message ?? 'unknown'}`,
        undefined,
        'EmailSenderService',
      );
      throw new Error(`Email delivery failed: ${response.status}`);
    }
  }

  private logCode(kind: string, email: string, code: string): void {
    this.logger.warn(
      `RESEND_API_KEY missing — ${kind} code for ${email}: ${code}`,
      'EmailSenderService',
    );
  }
}
