import { registerAs } from '@nestjs/config';

export default registerAs('email', () => ({
  resendApiKey: process.env.RESEND_API_KEY || null,
  from: process.env.EMAIL_FROM ?? 'Depredadog <onboarding@resend.dev>',
}));
