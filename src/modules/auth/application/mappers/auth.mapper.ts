import { Injectable } from '@nestjs/common';
import { User } from '../../domain/entities/user.entity';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { UserResponseDto } from '../dtos/user-response.dto';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthMapper {
  toUserResponse(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.phone = user.phone;
    dto.role = user.role;
    dto.status = user.status;
    dto.emailVerifiedAt = user.emailVerifiedAt?.toISOString() ?? null;
    dto.referralCode = user.referralCode;
    dto.marketingOptIn = user.marketingOptIn;
    dto.createdAt = user.createdAt.toISOString();
    return dto;
  }

  toAuthResponse(user: User, tokens: IssuedTokens): AuthResponseDto {
    const dto = new AuthResponseDto();
    dto.accessToken = tokens.accessToken;
    dto.refreshToken = tokens.refreshToken;
    dto.user = this.toUserResponse(user);
    return dto;
  }
}
