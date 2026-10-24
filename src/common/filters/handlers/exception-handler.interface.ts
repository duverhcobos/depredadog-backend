import { ArgumentsHost } from '@nestjs/common';

export interface ExceptionHandler {
  canHandle(exception: unknown): boolean;
  handle(exception: unknown, host: ArgumentsHost): void;
}
