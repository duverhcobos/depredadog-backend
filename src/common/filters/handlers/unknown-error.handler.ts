import { ArgumentsHost, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { LoggerService } from '../../logger/logger.service';
import { ExceptionHandler } from './exception-handler.interface';

@Injectable()
export class UnknownErrorHandler implements ExceptionHandler {
  constructor(private readonly logger: LoggerService) {}

  canHandle(): boolean {
    return true;
  }

  handle(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
      UnknownErrorHandler.name,
    );
    res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
}
