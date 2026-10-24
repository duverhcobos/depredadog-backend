import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { InvalidGoogleTokenException } from '../../domain/exceptions/invalid-google-token.exception';
import {
  GoogleProfile,
  IGoogleTokenVerifier,
} from '../../domain/services/google-token-verifier.interface';

@Injectable()
export class GoogleTokenVerifierService implements IGoogleTokenVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService) {}

  async verify(idToken: string): Promise<GoogleProfile> {
    const audiences = this.config.get<string[]>('auth.googleClientIds')!;
    // Sin client IDs configurados el endpoint no está disponible
    if (audiences.length === 0) throw new InvalidGoogleTokenException();
    const ticket = await this.client
      .verifyIdToken({ idToken, audience: audiences })
      .catch(() => {
        throw new InvalidGoogleTokenException();
      });
    const payload = ticket.getPayload();
    // Exigimos sub + email + email_verified=true (regla de seguridad del diseño)
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new InvalidGoogleTokenException();
    }
    return {
      googleId: payload.sub,
      email: payload.email,
      givenName: payload.given_name ?? null,
      familyName: payload.family_name ?? null,
    };
  }
}
