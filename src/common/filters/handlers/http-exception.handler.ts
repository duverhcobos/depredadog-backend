import { ArgumentsHost, HttpException, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { ExceptionHandler } from './exception-handler.interface';

@Injectable()
export class HttpExceptionHandler implements ExceptionHandler {
  canHandle(exception: unknown): boolean {
    return exception instanceof HttpException;
  }

  handle(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const ex = exception as HttpException;
    const status = ex.getStatus();
    const body = ex.getResponse();
    res.status(status).json(
      typeof body === 'object'
        ? { ...body, timestamp: new Date().toISOString() }
        : {
            statusCode: status,
            message: ex.message,
            timestamp: new Date().toISOString(),
          },
    );
  }
}
