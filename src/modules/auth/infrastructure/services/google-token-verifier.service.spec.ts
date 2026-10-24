import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { InvalidGoogleTokenException } from '../../domain/exceptions/invalid-google-token.exception';
import { GoogleTokenVerifierService } from './google-token-verifier.service';

describe('GoogleTokenVerifierService', () => {
  let service: GoogleTokenVerifierService;
  let config: jest.Mocked<ConfigService>;
  let verifyIdToken: jest.SpyInstance;

  beforeEach(() => {
    config = {
      get: jest.fn().mockReturnValue(['client-id-1']),
    } as unknown as jest.Mocked<ConfigService>;
    verifyIdToken = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken');
    service = new GoogleTokenVerifierService(config);
  });

  afterEach(() => {
    verifyIdToken.mockRestore();
  });

  function ticket(payload: object | undefined) {
    return { getPayload: () => payload } as never;
  }

  it('devuelve el perfil cuando el token es válido y verificado', async () => {
    verifyIdToken.mockResolvedValue(
      ticket({
        sub: 'g-1',
        email: 'a@b.com',
        email_verified: true,
        given_name: 'Ana',
        family_name: 'P',
      }),
    );
    const profile = await service.verify('id-token');
    expect(profile).toEqual({
      googleId: 'g-1',
      email: 'a@b.com',
      givenName: 'Ana',
      familyName: 'P',
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'id-token',
      audience: ['client-id-1'],
    });
  });

  it('rechaza si Google rechaza el token', async () => {
    verifyIdToken.mockRejectedValue(new Error('invalid'));
    await expect(service.verify('bad')).rejects.toBeInstanceOf(
      InvalidGoogleTokenException,
    );
  });

  it('rechaza si email_verified no es true', async () => {
    verifyIdToken.mockResolvedValue(
      ticket({ sub: 'g-1', email: 'a@b.com', email_verified: false }),
    );
    await expect(service.verify('tok')).rejects.toBeInstanceOf(
      InvalidGoogleTokenException,
    );
  });

  it('rechaza si no hay client IDs configurados', async () => {
    config.get.mockReturnValue([]);
    await expect(service.verify('tok')).rejects.toBeInstanceOf(
      InvalidGoogleTokenException,
    );
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
