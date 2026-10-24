import { PasswordHasherService } from './password-hasher.service';

describe('PasswordHasherService', () => {
  const hasher = new PasswordHasherService();

  it('hash + verify roundtrip', async () => {
    const hash = await hasher.hash('Password1!');
    expect(hash).not.toContain('Password1!');
    await expect(hasher.verify(hash, 'Password1!')).resolves.toBe(true);
  });

  it('verify devuelve false con password errado', async () => {
    const hash = await hasher.hash('Password1!');
    await expect(hasher.verify(hash, 'Otro123')).resolves.toBe(false);
  });

  it('verify devuelve false con hash inválido', async () => {
    await expect(hasher.verify('not-a-bcrypt-hash', 'x')).resolves.toBe(false);
  });
});
