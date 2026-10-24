import { ArgumentsHost, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';
import { ExceptionHandler } from './exception-handler.interface';

@Injectable()
export class ThrottlerExceptionHandler implements ExceptionHandler {
  canHandle(exception: unknown): boolean {
    return exception instanceof ThrottlerException;
  }

  handle(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(429).json({
      statusCode: 429,
      message: 'Too many requests',
      timestamp: new Date().toISOString(),
    });
  }
}
