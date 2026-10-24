import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  it('validate mapea el payload al usuario del request', () => {
    const config = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as jest.Mocked<ConfigService>;
    const strategy = new JwtStrategy(config);

    const user = strategy.validate({
      sub: 'u1',
      sid: 's1',
      email: 'a@b.com',
      role: 'customer',
    });

    expect(user).toEqual({
      userId: 'u1',
      sessionId: 's1',
      email: 'a@b.com',
      role: 'customer',
    });
    expect(config.get).toHaveBeenCalledWith('auth.jwtSecret');
  });
});
