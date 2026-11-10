import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsEnum(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  DB_HOST!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT!: number;

  @IsString()
  DB_USERNAME!: string;

  @IsString()
  DB_PASSWORD!: string; // puede ser vacío en dev local

  @IsString()
  DB_DATABASE!: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsInt()
  @Min(1)
  THROTTLE_TTL: number = 60;

  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = 100;

  @IsOptional()
  @IsString()
  MIGRATIONS_RUN?: string;

  @IsOptional()
  @IsString()
  DB_SYNCHRONIZE?: string;

  @IsString()
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_TTL?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  JWT_REFRESH_TTL_DAYS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_CODE_TTL_MINUTES?: number;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_IDS?: string;

  @IsOptional()
  @IsString()
  RESEND_API_KEY?: string;

  @IsOptional()
  @IsString()
  EMAIL_FROM?: string;

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;

  @IsOptional()
  @IsString()
  LOG_DIR?: string;

  @IsOptional()
  @IsString()
  LOG_MAX_FILES?: string;

  @IsOptional()
  @IsString()
  LOG_MAX_SIZE?: string;

  @IsOptional()
  @IsString()
  STORE_TIMEZONE?: string;

  @IsOptional()
  @IsString()
  PAYMENT_GATEWAY_DRIVER?: string;

  @IsOptional()
  @IsString()
  PAYMENT_WEBHOOK_SECRET?: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment variables: ${errors.toString()}`);
  }
  return validated;
}
