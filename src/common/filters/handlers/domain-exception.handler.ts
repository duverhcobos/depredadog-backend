import { ArgumentsHost, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from '../../exceptions/domain.exception';
import { ExceptionHandler } from './exception-handler.interface';

@Injectable()
export class DomainExceptionHandler implements ExceptionHandler {
  canHandle(exception: unknown): boolean {
    return exception instanceof DomainException;
  }

  handle(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const ex = exception as DomainException;
    res.status(ex.httpStatus).json({
      statusCode: ex.httpStatus,
      message: ex.message,
      timestamp: new Date().toISOString(),
    });
  }
}
