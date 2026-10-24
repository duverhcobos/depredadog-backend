export interface GoogleProfile {
  googleId: string;
  email: string;
  givenName: string | null;
  familyName: string | null;
}

export interface IGoogleTokenVerifier {
  verify(idToken: string): Promise<GoogleProfile>;
}

export const GOOGLE_TOKEN_VERIFIER = Symbol('IGoogleTokenVerifier');
