import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { AuthMapper } from './auth.mapper';

describe('AuthMapper', () => {
  const mapper = new AuthMapper();

  function user(): User {
    const u = new User();
    u.id = 'u1';
    u.email = 'a@b.com';
    u.firstName = 'Ana';
    u.role = UserRole.CUSTOMER;
    u.status = UserStatus.ACTIVE;
    u.referralCode = 'ABCD2345';
    u.createdAt = new Date('2026-01-01T00:00:00Z');
    u.updatedAt = u.createdAt;
    return u;
  }

  it('toUserResponse serializa fechas a ISO y nulos explícitos', () => {
    const dto = mapper.toUserResponse(user());
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(dto.lastName).toBeNull();
    expect(dto.phone).toBeNull();
    expect(dto.emailVerifiedAt).toBeNull();
    expect(dto.role).toBe('customer');
    expect(dto).not.toHaveProperty('passwordHash');
  });

  it('toAuthResponse empaqueta tokens + usuario', () => {
    const dto = mapper.toAuthResponse(user(), {
      accessToken: 'at',
      refreshToken: 'rt',
    });
    expect(dto.accessToken).toBe('at');
    expect(dto.refreshToken).toBe('rt');
    expect(dto.user.email).toBe('a@b.com');
  });
});
